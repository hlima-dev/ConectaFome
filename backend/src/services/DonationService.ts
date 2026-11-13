import { DonationAction, DonationStatus, FoodCategory, PhotoKind, Role, StorageCondition } from '@prisma/client'
import { prisma } from '../config/prisma'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../utils/AppError'
import { paginate, PaginationParams } from '../utils/pagination'
import { computeUrgency, withUrgency } from '../utils/urgency'
import { donationTransition } from './donationTransition'
import { NotificationService } from './NotificationService'
import { assertApproved } from './ApprovalService'
import { photoPolicy } from '../storage/StorageDriver'
import { donationCode, parseDonationCode, receiptSignature } from '../utils/donationCode'

interface CreateDonationInput {
  donorId?: string
  category?: FoodCategory
  description: string
  estimatedQuantityKg: number
  bestBeforeDate?: Date
  pickupWindowStart: Date
  pickupWindowEnd: Date
  storageCondition?: StorageCondition
  // Declaração do doador de que o alimento está próprio para consumo.
  acceptTerms: boolean
  notes?: string
}

// Perecível e preparado precisam de escolha explícita da condição de
// armazenamento; nas demais categorias o padrão (ambiente) é aceitável.
const STORAGE_REQUIRED_FOR: FoodCategory[] = [FoodCategory.PERECIVEL, FoodCategory.PREPARADO]

function assertStorageCondition(category: FoodCategory | undefined, storageCondition: StorageCondition | undefined) {
  if (category && STORAGE_REQUIRED_FOR.includes(category) && !storageCondition) {
    throw new ValidationError('Informe a condição de armazenamento para alimentos perecíveis ou preparados')
  }
}

type UpdateDonationInput = Partial<Omit<CreateDonationInput, 'donorId' | 'acceptTerms'>>

interface ListDonationsFilter {
  status?: DonationStatus
  donorId?: string
  recipientId?: string
  category?: FoodCategory
  // Busca livre: descrição, doador, receptor ou código (DOA-00042).
  q?: string
  // Período de registro (AAAA-MM-DD, inclusivo).
  from?: string
  to?: string
  // 'prazo' = quem vence primeiro (fim da janela de coleta); padrão = mais recentes.
  sort?: 'recentes' | 'prazo'
}

interface Requester {
  id: string
  role: Role
}

interface OpportunitiesFilter {
  city?: string
  category?: FoodCategory
}

// Teto de linhas carregadas para montar o painel: ele ordena por prazo em
// memória (o prazo é o menor entre validade e fim da janela, o que o banco
// não ordena direto). Para o volume esperado de doações DISPONÍVEIS sobra.
const OPPORTUNITIES_LIMIT = 500

export class DonationService {
  private notifications = new NotificationService()

  // Só a primeira foto da oferta (capa): a lista não precisa carregar todas.
  private coverPhoto = { where: { kind: PhotoKind.OFERTA }, select: { id: true }, orderBy: { createdAt: 'asc' as const }, take: 1 }

  // DOADOR sempre doa em nome do próprio cadastro (nunca de um donorId no
  // corpo da requisição); ADMIN pode criar em nome de qualquer doador,
  // passando donorId explicitamente.
  async create(input: CreateDonationInput, requester: Requester) {
    if (requester.role === Role.DOADOR) await assertApproved(requester.id)
    const donorId = await this.resolveDonorId(input.donorId, requester)

    if (input.acceptTerms !== true) {
      throw new ValidationError('É necessário declarar que o alimento está próprio para consumo')
    }
    assertStorageCondition(input.category, input.storageCondition)

    const created = await prisma.donation.create({
      data: {
        donorId,
        category: input.category,
        storageCondition: input.storageCondition,
        termsAcceptedAt: new Date(),
        events: {
          create: { action: DonationAction.CRIADA, fromStatus: null, toStatus: DonationStatus.DISPONIVEL, actorId: requester.id },
        },
        description: input.description,
        estimatedQuantityKg: input.estimatedQuantityKg,
        bestBeforeDate: input.bestBeforeDate,
        pickupWindowStart: input.pickupWindowStart,
        pickupWindowEnd: input.pickupWindowEnd,
        notes: input.notes,
      },
    })

    await this.notifications.onDonationEvent(DonationAction.CRIADA, created.id, requester.id)
    return created
  }

  async findAll(filter: ListDonationsFilter, pagination: PaginationParams, requester: Requester) {
    const scope = await this.scopeFilter(requester)

    const where = {
      ...scope,
      ...(filter.status && { status: filter.status }),
      ...(filter.donorId && { donorId: filter.donorId }),
      ...(filter.recipientId && { recipientId: filter.recipientId }),
      ...(filter.category && { category: filter.category }),
      ...this.searchWhere(filter.q),
      ...(filter.from || filter.to
        ? {
            createdAt: {
              ...(filter.from ? { gte: new Date(`${filter.from}T00:00:00.000Z`) } : {}),
              ...(filter.to ? { lt: new Date(new Date(`${filter.to}T00:00:00.000Z`).getTime() + 86_400_000) } : {}),
            },
          }
        : {}),
    }

    const [donations, total] = await Promise.all([
      prisma.donation.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: filter.sort === 'prazo' ? [{ pickupWindowEnd: 'asc' as const }, { createdAt: 'desc' as const }] : { createdAt: 'desc' as const },
        include: { donor: true, recipient: true, route: true, photos: this.coverPhoto },
      }),
      prisma.donation.count({ where }),
    ])

    return paginate(donations.map((d) => withUrgency(d)), total, pagination)
  }

  // Busca livre: texto na descrição, no nome do doador ou do receptor, ou o código da doação.
  private searchWhere(q: string | undefined) {
    const text = q?.trim()
    if (!text) return {}
    const number = parseDonationCode(text)
    return {
      OR: [
        { description: { contains: text, mode: 'insensitive' as const } },
        { donor: { name: { contains: text, mode: 'insensitive' as const } } },
        { recipient: { name: { contains: text, mode: 'insensitive' as const } } },
        ...(number !== null ? [{ number }] : []),
      ],
    }
  }

  async findById(id: string, requester: Requester) {
    const donation = await prisma.donation.findUnique({
      where: { id },
      include: { donor: true, recipient: true, route: true },
    })
    if (!donation) {
      throw new NotFoundError('Doação')
    }

    await this.assertAccess(donation, requester)
    return withUrgency(donation)
  }

  // Histórico da doação, do mais antigo ao mais recente. Quem pode ver a
  // doação pode ver o histórico (mesma regra de acesso do findById).
  async findEvents(id: string, requester: Requester) {
    const donation = await this.getOrThrow(id)
    await this.assertAccess(donation, requester)

    return prisma.donationEvent.findMany({
      where: { donationId: id },
      orderBy: { createdAt: 'asc' },
      include: { actor: { select: { id: true, name: true, role: true } } },
    })
  }

  // Comprovante de doação: só depois que o alimento foi coletado (antes disso
  // ainda não houve doação de fato). Quem emite: o administrador ou o doador
  // dono. É um documento do sistema e não substitui nota fiscal ou recibo
  // exigido por lei.
  async getReceipt(id: string, requester: Requester) {
    const donation = await prisma.donation.findUnique({ where: { id }, include: { donor: true, recipient: true } })
    if (!donation) {
      throw new NotFoundError('Doação')
    }

    if (requester.role !== Role.ADMIN) {
      const donor = requester.role === Role.DOADOR ? await prisma.donor.findUnique({ where: { userId: requester.id } }) : null
      if (!donor || donor.id !== donation.donorId) {
        throw new ForbiddenError('Você só pode emitir o comprovante das próprias doações')
      }
    }

    const issuable: DonationStatus[] = [DonationStatus.COLETADA, DonationStatus.ENTREGUE]
    if (!issuable.includes(donation.status)) {
      throw new ValidationError('O comprovante só pode ser emitido depois que a doação for coletada')
    }

    const party = (p: { name: string; document: string | null; address: string | null; city: string | null; state: string | null }) => ({
      name: p.name,
      document: p.document,
      address: [p.address, p.city, p.state].filter(Boolean).join(', ') || null,
    })

    return {
      number: donationCode(donation.number),
      // Vai no QR code do comprovante: quem escaneia confere se ele é autêntico.
      verification: { code: donationCode(donation.number), signature: receiptSignature(donationCode(donation.number)) },
      issuedAt: new Date(),
      donor: party(donation.donor),
      recipient: donation.recipient ? party(donation.recipient) : null,
      donation: {
        description: donation.description,
        category: donation.category,
        storageCondition: donation.storageCondition,
        estimatedQuantityKg: Number(donation.estimatedQuantityKg),
        collectedQuantityKg: donation.collectedQuantityKg === null ? null : Number(donation.collectedQuantityKg),
        status: donation.status,
        bestBeforeDate: donation.bestBeforeDate,
        termsAcceptedAt: donation.termsAcceptedAt,
        registeredAt: donation.createdAt,
        collectedAt: donation.collectedAt,
        confirmedAt: donation.confirmedAt,
      },
    }
  }

  // Só pode editar detalhes enquanto ninguém ainda se comprometeu com a
  // doação — depois de RESERVADA, mudar quantidade/janela seria enganar
  // quem já foi casado com ela.
  async update(id: string, input: UpdateDonationInput, requester: Requester) {
    const donation = await this.findByIdForOwnerAction(id, requester)

    if (donation.status !== DonationStatus.DISPONIVEL) {
      throw new ValidationError('Só é possível editar uma doação enquanto ela está disponível')
    }

    if (input.category !== undefined && input.storageCondition === undefined) {
      assertStorageCondition(input.category, undefined)
    }

    return prisma.donation.update({ where: { id: donation.id }, data: input })
  }

  async match(id: string, recipientId: string, requester: Requester) {
    const donation = await this.getOrThrow(id)

    // DISPONIVEL: primeiro casamento. RESERVADA: reatribuição a outro receptor
    // (o receptor que reservou não pode mais atender). AGENDADA já está numa
    // rota e precisa sair dela antes.
    const matchableFrom: DonationStatus[] = [DonationStatus.DISPONIVEL, DonationStatus.RESERVADA]
    if (!matchableFrom.includes(donation.status)) {
      throw new ValidationError('Só é possível casar ou reatribuir uma doação disponível ou reservada')
    }

    const recipient = await prisma.recipient.findUnique({ where: { id: recipientId } })
    if (!recipient || !recipient.active) {
      throw new NotFoundError('Receptor')
    }

    const [updated] = await prisma.$transaction([
      ...donationTransition(
        donation,
        DonationAction.CASADA,
        { status: DonationStatus.RESERVADA, recipientId, matchedAt: new Date() },
        requester.id,
      ),
    ])
    await this.notifications.onDonationEvent(DonationAction.CASADA, id, requester.id)
    return updated
  }

  // Painel de oportunidades do receptor: doações DISPONÍVEIS ainda dentro do
  // prazo, da mais urgente para a menos, com filtro por cidade do doador e
  // categoria. O endereço completo do doador só aparece depois da reserva.
  async opportunities(filter: OpportunitiesFilter, pagination: PaginationParams, requester: Requester) {
    if (requester.role !== Role.RECEPTOR && requester.role !== Role.ADMIN) {
      throw new ForbiddenError('Apenas receptores e administradores veem as oportunidades')
    }

    const rows = await prisma.donation.findMany({
      where: {
        status: DonationStatus.DISPONIVEL,
        // Com a exigência ligada, doação sem foto da oferta nem aparece para reserva.
        ...(photoPolicy().offerRequired ? { photos: { some: { kind: PhotoKind.OFERTA } } } : {}),
        donor: {
          active: true,
          ...(filter.city ? { city: { contains: filter.city, mode: 'insensitive' as const } } : {}),
        },
        ...(filter.category ? { category: filter.category } : {}),
      },
      include: { donor: { select: { id: true, name: true, city: true, state: true } }, photos: this.coverPhoto },
      take: OPPORTUNITIES_LIMIT,
    })

    const open = rows
      .map((d) => withUrgency(d))
      .filter((d) => d.urgency && d.urgency.level !== 'EXPIRED')
      .sort((a, b) => a.urgency!.deadline.getTime() - b.urgency!.deadline.getTime())

    return paginate(open.slice(pagination.skip, pagination.skip + pagination.limit), open.length, pagination)
  }

  // O receptor reserva uma doação para si. A troca de estado é condicional
  // (só se ainda estiver DISPONÍVEL) dentro de uma transação: se dois
  // receptores clicam ao mesmo tempo, um vence e o outro recebe um conflito.
  async reserve(id: string, requester: Requester) {
    if (requester.role !== Role.RECEPTOR) {
      throw new ForbiddenError('Apenas receptores reservam doações pelo painel (o administrador usa o casamento)')
    }
    await assertApproved(requester.id)
    const recipient = await prisma.recipient.findUnique({ where: { userId: requester.id } })
    if (!recipient || !recipient.active) {
      throw new ForbiddenError('Cadastro de receptor não encontrado ou inativo')
    }

    const donation = await this.getOrThrow(id)
    if (computeUrgency(donation)?.level === 'EXPIRED') {
      throw new ValidationError('O prazo desta doação já encerrou')
    }
    if (photoPolicy().offerRequired && (await prisma.donationPhoto.count({ where: { donationId: id, kind: PhotoKind.OFERTA } })) === 0) {
      throw new ValidationError('Esta doação ainda não tem foto do alimento')
    }

    const reserved = await prisma.$transaction(async (tx) => {
      const result = await tx.donation.updateMany({
        where: { id, status: DonationStatus.DISPONIVEL },
        data: { status: DonationStatus.RESERVADA, recipientId: recipient.id, matchedAt: new Date() },
      })
      if (result.count === 0) {
        throw new ConflictError('Esta doação não está mais disponível')
      }
      await tx.donationEvent.create({
        data: {
          donationId: id,
          action: DonationAction.RESERVADA,
          fromStatus: DonationStatus.DISPONIVEL,
          toStatus: DonationStatus.RESERVADA,
          actorId: requester.id,
        },
      })
      return tx.donation.findUniqueOrThrow({ where: { id } })
    })

    await this.notifications.onDonationEvent(DonationAction.RESERVADA, id, requester.id)
    return reserved
  }

  // Desfaz a reserva (o receptor dono ou o administrador): a doação volta a
  // ficar disponível. Não vale se já entrou numa rota — aí é preciso tirá-la
  // da rota primeiro.
  async release(id: string, requester: Requester) {
    const donation = await this.getOrThrow(id)
    await this.assertRecipientAccess(donation, requester)

    const released = await prisma.$transaction(async (tx) => {
      const result = await tx.donation.updateMany({
        where: { id, status: DonationStatus.RESERVADA, routeId: null },
        data: { status: DonationStatus.DISPONIVEL, recipientId: null, matchedAt: null },
      })
      if (result.count === 0) {
        throw new ValidationError('Só é possível liberar uma doação reservada que ainda não está em uma rota')
      }
      await tx.donationEvent.create({
        data: {
          donationId: id,
          action: DonationAction.LIBERADA,
          fromStatus: DonationStatus.RESERVADA,
          toStatus: DonationStatus.DISPONIVEL,
          actorId: requester.id,
        },
      })
      return tx.donation.findUniqueOrThrow({ where: { id } })
    })

    await this.notifications.onDonationEvent(DonationAction.LIBERADA, id, requester.id)
    return released
  }

  async cancel(id: string, requester: Requester) {
    const donation = await this.findByIdForOwnerAction(id, requester)

    const cancelableFrom: DonationStatus[] = [DonationStatus.DISPONIVEL, DonationStatus.RESERVADA]
    if (!cancelableFrom.includes(donation.status)) {
      throw new ValidationError('Essa doação não pode mais ser cancelada')
    }

    const [updated] = await prisma.$transaction([
      ...donationTransition(
        donation,
        DonationAction.CANCELADA,
        { status: DonationStatus.CANCELADA, canceledAt: new Date() },
        requester.id,
      ),
    ])
    await this.notifications.onDonationEvent(DonationAction.CANCELADA, id, requester.id)
    return updated
  }

  async markExpired(id: string, requester: Requester) {
    const donation = await this.findByIdForOwnerAction(id, requester)

    const expirableFrom: DonationStatus[] = [DonationStatus.DISPONIVEL, DonationStatus.RESERVADA]
    if (!expirableFrom.includes(donation.status)) {
      throw new ValidationError('Só é possível vencer uma doação disponível ou reservada')
    }

    const [updated] = await prisma.$transaction([
      ...donationTransition(
        donation,
        DonationAction.VENCIDA,
        { status: DonationStatus.VENCIDA, expiredAt: new Date() },
        requester.id,
      ),
    ])
    await this.notifications.onDonationEvent(DonationAction.VENCIDA, id, requester.id)
    return updated
  }

  // Ação do receptor: confirma que recebeu de fato o que o voluntário
  // coletou. Só existe a partir de COLETADA — chega nesse estado quando a
  // rota de coleta (Fase 4) é concluída.
  async confirmReceipt(id: string, requester: Requester) {
    const donation = await this.getOrThrow(id)
    await this.assertRecipientAccess(donation, requester)

    if (donation.status !== DonationStatus.COLETADA) {
      throw new ValidationError('Só é possível confirmar recebimento de uma doação já coletada')
    }

    const [updated] = await prisma.$transaction([
      ...donationTransition(
        donation,
        DonationAction.CONFIRMADA,
        { status: DonationStatus.ENTREGUE, confirmedAt: new Date() },
        requester.id,
      ),
    ])
    await this.notifications.onDonationEvent(DonationAction.CONFIRMADA, id, requester.id)
    return updated
  }

  private async getOrThrow(id: string) {
    const donation = await prisma.donation.findUnique({ where: { id } })
    if (!donation) {
      throw new NotFoundError('Doação')
    }
    return donation
  }

  // Usado pelas ações que só o doador dono (ou ADMIN) pode fazer:
  // editar, cancelar, vencer.
  private async findByIdForOwnerAction(id: string, requester: Requester) {
    const donation = await this.getOrThrow(id)

    if (requester.role === Role.ADMIN) return donation

    if (requester.role === Role.DOADOR) {
      const donor = await prisma.donor.findUnique({ where: { userId: requester.id } })
      if (donor && donation.donorId === donor.id) return donation
    }

    throw new ForbiddenError('Você só pode agir sobre as próprias doações')
  }

  private async assertRecipientAccess(donation: { recipientId: string | null }, requester: Requester) {
    if (requester.role === Role.ADMIN) return

    if (requester.role === Role.RECEPTOR) {
      const recipient = await prisma.recipient.findUnique({ where: { userId: requester.id } })
      if (recipient && donation.recipientId === recipient.id) return
    }

    throw new ForbiddenError('Você só pode agir sobre as próprias doações')
  }

  private async assertAccess(
    donation: { donorId: string; recipientId: string | null },
    requester: Requester,
  ) {
    if (requester.role === Role.ADMIN) return

    if (requester.role === Role.DOADOR) {
      const donor = await prisma.donor.findUnique({ where: { userId: requester.id } })
      if (donor && donation.donorId === donor.id) return
    }

    if (requester.role === Role.RECEPTOR) {
      const recipient = await prisma.recipient.findUnique({ where: { userId: requester.id } })
      if (recipient && donation.recipientId === recipient.id) return
    }

    throw new ForbiddenError('Você não tem acesso a essa doação')
  }

  private async resolveDonorId(inputDonorId: string | undefined, requester: Requester): Promise<string> {
    if (requester.role === Role.ADMIN) {
      if (!inputDonorId) {
        throw new ValidationError('Informe o doador (donorId) ao criar em nome de alguém')
      }
      return inputDonorId
    }

    if (requester.role === Role.DOADOR) {
      const donor = await prisma.donor.findUnique({ where: { userId: requester.id } })
      if (!donor || !donor.active) {
        throw new ForbiddenError('Cadastro de doador não encontrado ou inativo')
      }
      return donor.id
    }

    throw new ForbiddenError('Apenas doadores ou administradores podem cadastrar doações')
  }

  private async scopeFilter(requester: Requester) {
    if (requester.role === Role.ADMIN) return {}

    if (requester.role === Role.DOADOR) {
      const donor = await prisma.donor.findUnique({ where: { userId: requester.id } })
      return { donorId: donor?.id ?? '__none__' }
    }

    const recipient = await prisma.recipient.findUnique({ where: { userId: requester.id } })
    return { recipientId: recipient?.id ?? '__none__' }
  }
}
