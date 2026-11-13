import { DonationAction, DonationStatus, PickupFailureReason, PickupRouteStatus } from '@prisma/client'
import { prisma } from '../config/prisma'
import { NotFoundError, ValidationError } from '../utils/AppError'
import { paginate, PaginationParams } from '../utils/pagination'
import { donationTransition } from './donationTransition'
import { NotificationService } from './NotificationService'
import { computeUrgency } from '../utils/urgency'
import { computeLoad, groupByDonor, planRoute } from '../utils/routePlanner'

interface CreatePickupRouteInput {
  vehicleId: string
  volunteerId: string
  scheduledFor: Date
  notes?: string
}

type UpdatePickupRouteInput = Partial<CreatePickupRouteInput>

interface ListPickupRoutesFilter {
  status?: PickupRouteStatus
  vehicleId?: string
  volunteerId?: string
}

interface CollectedQuantityOverride {
  donationId: string
  collectedQuantityKg: number
}

export interface StopActor {
  userId?: string
  // Quem agiu quando não é um usuário (voluntário pelo link de campo).
  label?: string
}

export const FAILURE_LABELS: Record<PickupFailureReason, string> = {
  DOADOR_AUSENTE: 'Doador ausente',
  RECUSADO: 'Doador recusou entregar',
  PRODUTO_IMPROPRIO: 'Produto impróprio para consumo',
  SEM_ESPACO_NO_VEICULO: 'Sem espaço no veículo',
  OUTRO: 'Outro motivo',
}

const routeInclude = {
  vehicle: true,
  volunteer: true,
  donations: { include: { donor: true, recipient: true } },
  // Paradas que não deram certo nesta rota (a doação saiu da rota, mas o registro fica).
  failedDonations: { include: { donor: true } },
}

type RouteWithRelations = {
  vehicle?: { capacityKg?: unknown } | null
  donations?: {
    id: string
    description: string
    status: DonationStatus
    estimatedQuantityKg: unknown
    bestBeforeDate: Date | null
    pickupWindowEnd: Date
    donor: { id: string; name: string; address: string | null; city: string | null; latitude: number | null; longitude: number | null }
    recipient: { id: string; name: string; address: string | null; latitude: number | null; longitude: number | null } | null
  }[]
}

const toNumber = (value: unknown) => (value === null || value === undefined ? null : Number(value))

// Acrescenta à rota o que a tela precisa para decidir: a carga contra a
// capacidade do veículo e o plano de paradas (ordem sugerida, distância em
// linha reta e onde ficam os receptores).
export function withPlan<T extends RouteWithRelations>(route: T) {
  const donations = route.donations ?? []

  const load = computeLoad(donations.map((d) => Number(d.estimatedQuantityKg)), toNumber(route.vehicle?.capacityKg))

  const plan = planRoute(
    groupByDonor(
      donations.map((d) => ({
        donor: {
          donorId: d.donor.id,
          donorName: d.donor.name,
          address: d.donor.address,
          city: d.donor.city,
          latitude: d.donor.latitude,
          longitude: d.donor.longitude,
        },
        donation: {
          id: d.id,
          description: d.description,
          estimatedKg: Number(d.estimatedQuantityKg),
          deadline: computeUrgency(d)?.deadline ?? null,
        },
      })),
    ),
  )

  const recipients = new Map<string, { id: string; name: string; address: string | null; latitude: number; longitude: number }>()
  for (const d of donations) {
    const r = d.recipient
    if (r && r.latitude !== null && r.longitude !== null) {
      recipients.set(r.id, { id: r.id, name: r.name, address: r.address, latitude: r.latitude, longitude: r.longitude })
    }
  }

  return { ...route, load, plan: { ...plan, recipients: [...recipients.values()] } }
}

export class PickupRouteService {
  private notifications = new NotificationService()

  async create(input: CreatePickupRouteInput) {
    const vehicle = await prisma.vehicle.findUnique({ where: { id: input.vehicleId } })
    if (!vehicle || !vehicle.active) {
      throw new NotFoundError('Veículo')
    }

    const volunteer = await prisma.volunteer.findUnique({ where: { id: input.volunteerId } })
    if (!volunteer || !volunteer.active) {
      throw new NotFoundError('Voluntário')
    }

    return prisma.pickupRoute.create({
      data: input,
      include: routeInclude,
    })
  }

  async findAll(filter: ListPickupRoutesFilter, pagination: PaginationParams) {
    const where = {
      ...(filter.status && { status: filter.status }),
      ...(filter.vehicleId && { vehicleId: filter.vehicleId }),
      ...(filter.volunteerId && { volunteerId: filter.volunteerId }),
    }

    const [routes, total] = await Promise.all([
      prisma.pickupRoute.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { scheduledFor: 'desc' },
        include: routeInclude,
      }),
      prisma.pickupRoute.count({ where }),
    ])

    return paginate(routes, total, pagination)
  }

  async findById(id: string) {
    const route = await prisma.pickupRoute.findUnique({ where: { id }, include: routeInclude })
    if (!route) {
      throw new NotFoundError('Rota de coleta')
    }
    return withPlan(route)
  }

  // Só dá pra editar dados da rota (veículo/voluntário/horário) enquanto
  // nada saiu ainda — depois de iniciada, mudar o veículo no meio do
  // caminho não faz sentido operacional.
  async update(id: string, input: UpdatePickupRouteInput) {
    const route = await this.getOrThrow(id)

    if (route.status !== PickupRouteStatus.PLANEJADA) {
      throw new ValidationError('Só é possível editar uma rota enquanto ela está planejada')
    }

    return prisma.pickupRoute.update({ where: { id }, data: input, include: routeInclude })
  }

  // Anexa uma doação já casada (RESERVADA, sem rota) a uma rota planejada.
  async attachDonation(routeId: string, donationId: string, actorId?: string) {
    const route = await this.getOrThrow(routeId)
    if (route.status !== PickupRouteStatus.PLANEJADA) {
      throw new ValidationError('Só é possível anexar doações a uma rota planejada')
    }

    const donation = await prisma.donation.findUnique({ where: { id: donationId } })
    if (!donation) {
      throw new NotFoundError('Doação')
    }
    if (donation.status !== DonationStatus.RESERVADA || donation.routeId) {
      throw new ValidationError('Só é possível anexar uma doação reservada e ainda sem rota')
    }

    await prisma.$transaction([
      ...donationTransition(donation, DonationAction.AGENDADA, { status: DonationStatus.AGENDADA, routeId, pickupFailureReason: null, pickupFailureNote: null, pickupFailedAt: null, failedRouteId: null }, actorId),
    ])
    await this.notifications.onDonationEvent(DonationAction.AGENDADA, donationId, actorId)

    return this.findById(routeId)
  }

  // Desanexa e devolve a doação pra RESERVADA — ela volta a poder ser
  // roteada em outra rota planejada depois.
  async detachDonation(routeId: string, donationId: string, actorId?: string) {
    const route = await this.getOrThrow(routeId)
    if (route.status !== PickupRouteStatus.PLANEJADA) {
      throw new ValidationError('Só é possível desanexar doações de uma rota planejada')
    }

    const donation = await prisma.donation.findUnique({ where: { id: donationId } })
    if (!donation || donation.routeId !== routeId) {
      throw new NotFoundError('Doação não encontrada nessa rota')
    }

    await prisma.$transaction([
      ...donationTransition(donation, DonationAction.DESAGENDADA, { status: DonationStatus.RESERVADA, routeId: null }, actorId),
    ])
    await this.notifications.onDonationEvent(DonationAction.DESAGENDADA, donationId, actorId)

    return this.findById(routeId)
  }

  async start(id: string) {
    const route = await prisma.pickupRoute.findUnique({
      where: { id },
      include: { vehicle: true, donations: { select: { estimatedQuantityKg: true } } },
    })
    if (!route) {
      throw new NotFoundError('Rota de coleta')
    }

    if (route.status !== PickupRouteStatus.PLANEJADA) {
      throw new ValidationError('Só é possível iniciar uma rota planejada')
    }

    const donations = route.donations ?? []
    if (donations.length === 0) {
      throw new ValidationError('Anexe ao menos uma doação antes de iniciar a rota')
    }

    // Anexar permite passar da capacidade (a tela avisa); sair com a rota
    // carregada acima do que o veículo comporta, não.
    const load = computeLoad(donations.map((d) => Number(d.estimatedQuantityKg)), toNumber(route.vehicle?.capacityKg))
    if (load.exceeds) {
      throw new ValidationError(
        `O peso estimado das doações (${load.totalKg} kg) excede a capacidade do veículo (${load.capacityKg} kg). Retire doações da rota ou troque o veículo.`,
      )
    }

    return prisma.pickupRoute.update({
      where: { id },
      data: { status: PickupRouteStatus.EM_ANDAMENTO, departedAt: new Date() },
      include: routeInclude,
    })
  }

  // Conclui a rota e propaga COLETADA + collectedAt (+ collectedQuantityKg,
  // com o estimado como padrão) pra toda doação anexada — é o evento que
  // conta como "resgatado" no relatório.
  async complete(id: string, overrides: CollectedQuantityOverride[] = [], actorId?: string) {
    const route = await this.getOrThrow(id)

    if (route.status !== PickupRouteStatus.EM_ANDAMENTO) {
      throw new ValidationError('Só é possível concluir uma rota em andamento')
    }

    // Paradas já coletadas ou que falharam uma a uma (collectStop/failStop) não
    // são tocadas de novo: aqui só entram as que ainda estão agendadas.
    const donations = await prisma.donation.findMany({ where: { routeId: id, status: DonationStatus.AGENDADA } })
    const overrideMap = new Map(overrides.map((o) => [o.donationId, o.collectedQuantityKg]))
    const collectedAt = new Date()

    await prisma.$transaction([
      ...donations.flatMap((donation) =>
        donationTransition(
          donation,
          DonationAction.COLETADA,
          {
            status: DonationStatus.COLETADA,
            collectedAt,
            collectedQuantityKg: overrideMap.get(donation.id) ?? donation.estimatedQuantityKg,
          },
          actorId,
        ),
      ),
      prisma.pickupRoute.update({
        where: { id },
        data: { status: PickupRouteStatus.CONCLUIDA, completedAt: collectedAt },
      }),
    ])

    for (const donation of donations) {
      await this.notifications.onDonationEvent(DonationAction.COLETADA, donation.id, actorId)
    }
    return this.findById(id)
  }

  // Coleta de UMA parada (o voluntário chegou, conferiu e pegou). A doação vira
  // COLETADA na hora; a rota continua em andamento até as outras serem resolvidas.
  async collectStop(routeId: string, donationId: string, input: { quantityKg?: number }, actor: StopActor = {}) {
    const donation = await this.getStopOrThrow(routeId, donationId)
    if (input.quantityKg !== undefined && !(input.quantityKg > 0)) {
      throw new ValidationError('Informe uma quantidade coletada maior que zero')
    }

    await prisma.$transaction([
      ...donationTransition(
        donation,
        DonationAction.COLETADA,
        {
          status: DonationStatus.COLETADA,
          collectedAt: new Date(),
          collectedQuantityKg: input.quantityKg ?? donation.estimatedQuantityKg,
        },
        actor.userId,
        { actorLabel: actor.label },
      ),
    ])
    await this.notifications.onDonationEvent(DonationAction.COLETADA, donationId, actor.userId)
    return this.findById(routeId)
  }

  // Parada que não deu certo. Doador ausente, falta de espaço ou outro motivo
  // devolvem a doação para reagendar (volta a RESERVADA, fora da rota); produto
  // impróprio ou recusado cancelam a doação. O motivo fica registrado.
  async failStop(routeId: string, donationId: string, input: { reason: PickupFailureReason; note?: string }, actor: StopActor = {}) {
    const donation = await this.getStopOrThrow(routeId, donationId)
    const note = input.note?.trim() || undefined
    if (input.reason === PickupFailureReason.OUTRO && !note) {
      throw new ValidationError('Descreva o que aconteceu')
    }

    const cancels = input.reason === PickupFailureReason.RECUSADO || input.reason === PickupFailureReason.PRODUTO_IMPROPRIO
    const detail = `${FAILURE_LABELS[input.reason]}${note ? ` (${note})` : ''}`

    await prisma.$transaction([
      ...donationTransition(
        donation,
        DonationAction.COLETA_FALHOU,
        cancels
          ? { status: DonationStatus.CANCELADA, canceledAt: new Date(), routeId: null }
          : { status: DonationStatus.RESERVADA, routeId: null },
        actor.userId,
        { actorLabel: actor.label, detail },
      ),
      prisma.donation.update({
        where: { id: donationId },
        data: { pickupFailureReason: input.reason, pickupFailureNote: note ?? null, pickupFailedAt: new Date(), failedRouteId: routeId },
      }),
    ])
    await this.notifications.onDonationEvent(DonationAction.COLETA_FALHOU, donationId, actor.userId, detail)
    return this.findById(routeId)
  }

  private async getStopOrThrow(routeId: string, donationId: string) {
    const route = await this.getOrThrow(routeId)
    if (route.status !== PickupRouteStatus.EM_ANDAMENTO) {
      throw new ValidationError('A rota precisa estar em andamento para registrar a coleta de uma parada')
    }
    const donation = await prisma.donation.findUnique({ where: { id: donationId } })
    if (!donation || donation.routeId !== routeId) {
      throw new NotFoundError('Doação não encontrada nessa rota')
    }
    if (donation.status !== DonationStatus.AGENDADA) {
      throw new ValidationError('Esta parada já foi resolvida')
    }
    return donation
  }

  // Sem precedente no PRODUCTION ERP (o romaneio de lá não tem essa saída)
  // — devolve toda doação anexada pra RESERVADA, limpando a rota delas.
  async cancel(id: string, actorId?: string) {
    const route = await this.getOrThrow(id)

    if (route.status !== PickupRouteStatus.PLANEJADA) {
      throw new ValidationError('Só é possível cancelar uma rota ainda planejada')
    }

    const donations = await prisma.donation.findMany({ where: { routeId: id } })

    await prisma.$transaction([
      ...donations.flatMap((donation) =>
        donationTransition(donation, DonationAction.DESAGENDADA, { status: DonationStatus.RESERVADA, routeId: null }, actorId),
      ),
      prisma.pickupRoute.update({
        where: { id },
        data: { status: PickupRouteStatus.CANCELADA, canceledAt: new Date() },
      }),
    ])

    for (const donation of donations) {
      await this.notifications.onDonationEvent(DonationAction.DESAGENDADA, donation.id, actorId)
    }
    return this.findById(id)
  }

  private async getOrThrow(id: string) {
    const route = await prisma.pickupRoute.findUnique({ where: { id } })
    if (!route) {
      throw new NotFoundError('Rota de coleta')
    }
    return route
  }
}
