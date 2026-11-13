import { createHash, randomBytes } from 'node:crypto'
import { DonationStatus, PhotoKind, PickupFailureReason, PickupRouteStatus } from '@prisma/client'
import { prisma } from '../config/prisma'
import { AppError, ValidationError } from '../utils/AppError'
import { absoluteLink } from './EmailService'
import { PhotoService } from './PhotoService'
import { PickupRouteService, StopActor } from './PickupRouteService'
import { getStorage, photoPolicy } from '../storage/StorageDriver'

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
const HOURS_48 = 48 * 3_600_000

// Mesma resposta para link inexistente, revogado ou vencido: não ajuda quem tenta adivinhar.
const invalidLink = () => new AppError('Este link não é válido ou já expirou. Peça um novo à administração.', 404)

// Modo "campo": o voluntário abre o link no celular, sem criar conta, e registra
// as paradas da rota com foto. O link vale para UMA rota, expira e pode ser
// trocado/revogado pela administração. É uma credencial: quem tem o link age como
// o voluntário naquela rota, e só nela.
export class FieldService {
  private routes = new PickupRouteService()
  private photos = new PhotoService()

  // Gera um link novo e revoga os anteriores da mesma rota.
  async createLink(routeId: string) {
    const route = await prisma.pickupRoute.findUnique({ where: { id: routeId } })
    if (!route) throw new AppError('Rota de coleta não encontrada', 404)
    if (route.status !== PickupRouteStatus.PLANEJADA && route.status !== PickupRouteStatus.EM_ANDAMENTO) {
      throw new ValidationError('Só é possível gerar o link de uma rota planejada ou em andamento')
    }

    const token = randomBytes(32).toString('hex')
    const base = Math.max(route.scheduledFor.getTime(), Date.now())
    const expiresAt = new Date(base + HOURS_48)

    await prisma.$transaction([
      prisma.pickupRouteAccess.updateMany({ where: { routeId, revokedAt: null }, data: { revokedAt: new Date() } }),
      prisma.pickupRouteAccess.create({ data: { routeId, tokenHash: hashToken(token), expiresAt } }),
    ])
    return { link: absoluteLink(`/coleta/${token}`), expiresAt }
  }

  async revokeLinks(routeId: string) {
    await prisma.pickupRouteAccess.updateMany({ where: { routeId, revokedAt: null }, data: { revokedAt: new Date() } })
  }

  private async resolve(token: string) {
    if (!/^[0-9a-f]{64}$/.test(token)) throw invalidLink()
    const access = await prisma.pickupRouteAccess.findUnique({ where: { tokenHash: hashToken(token) } })
    if (!access || access.revokedAt || access.expiresAt < new Date()) throw invalidLink()
    void prisma.pickupRouteAccess.update({ where: { id: access.id }, data: { lastUsedAt: new Date() } }).catch(() => undefined)
    const route = await prisma.pickupRoute.findUniqueOrThrow({ where: { id: access.routeId }, include: { volunteer: true } })
    const actor: StopActor = { label: `Voluntário ${route.volunteer.name} (link de campo)` }
    return { access, route, actor }
  }

  // O que o voluntário precisa para trabalhar: paradas em ordem, endereço, contato
  // e o que coletar. Não expõe dados de outras rotas nem relatórios.
  async view(token: string) {
    const { access, route } = await this.resolve(token)
    const full = await this.routes.findById(route.id)

    const byId = new Map(full.donations.map((d) => [d.id, d]))
    const plannedStops = [...full.plan.stops, ...full.plan.unlocated]

    const stops = plannedStops.map((stop, index) => {
      const donor = stop.donations.map((d) => byId.get(d.id)?.donor).find(Boolean)
      return {
        sequence: index + 1,
        donorName: stop.donorName,
        address: stop.address,
        city: stop.city,
        latitude: stop.latitude,
        longitude: stop.longitude,
        contactName: donor?.contactName ?? null,
        phone: donor?.phone ?? null,
        donations: stop.donations.map((planned) => {
          const donation = byId.get(planned.id)!
          return {
            id: donation.id,
            description: donation.description,
            estimatedKg: Number(donation.estimatedQuantityKg),
            collectedKg: donation.collectedQuantityKg === null ? null : Number(donation.collectedQuantityKg),
            storageCondition: donation.storageCondition,
            status: donation.status,
            notes: donation.notes,
            recipientName: donation.recipient?.name ?? null,
            recipientAddress: donation.recipient?.address ?? null,
          }
        }),
      }
    })

    const photoCounts = await prisma.donationPhoto.groupBy({
      by: ['donationId'],
      where: { kind: PhotoKind.COLETA, donationId: { in: full.donations.map((d) => d.id) } },
      _count: true,
    })
    const counts = new Map(photoCounts.map((p) => [p.donationId, p._count]))

    return {
      route: {
        routeNumber: full.routeNumber,
        status: full.status,
        scheduledFor: full.scheduledFor,
        departedAt: full.departedAt,
        completedAt: full.completedAt,
      },
      volunteerName: full.volunteer.name,
      vehicle: { plate: full.vehicle.plate, model: full.vehicle.model },
      expiresAt: access.expiresAt,
      photosEnabled: photoPolicy().enabled,
      requirePhoto: photoPolicy().pickupRequired,
      stops: stops.map((s) => ({ ...s, donations: s.donations.map((d) => ({ ...d, photoCount: counts.get(d.id) ?? 0 })) })),
      failed: (full.failedDonations ?? []).map((d) => ({
        id: d.id,
        description: d.description,
        donorName: d.donor.name,
        reason: d.pickupFailureReason,
        note: d.pickupFailureNote,
      })),
    }
  }

  async start(token: string) {
    const { route } = await this.resolve(token)
    await this.routes.start(route.id)
    return this.view(token)
  }

  async collect(token: string, donationId: string, files: Buffer[], quantityKg?: number) {
    const { route, actor } = await this.resolve(token)
    if (photoPolicy().pickupRequired && files.length === 0) {
      throw new ValidationError('Tire ao menos uma foto do que está sendo coletado')
    }
    await this.routes.assertStopOpen(route.id, donationId)
    await this.withPhotos(donationId, files, actor, () => this.routes.collectStop(route.id, donationId, { quantityKg }, actor))
    return this.view(token)
  }

  async fail(token: string, donationId: string, reason: PickupFailureReason, note: string | undefined, files: Buffer[]) {
    const { route, actor } = await this.resolve(token)
    await this.routes.assertStopOpen(route.id, donationId)
    await this.withPhotos(donationId, files, actor, () => this.routes.failStop(route.id, donationId, { reason, note }, actor))
    return this.view(token)
  }

  async finish(token: string) {
    const { route } = await this.resolve(token)
    const open = await prisma.donation.count({ where: { routeId: route.id, status: DonationStatus.AGENDADA } })
    if (open > 0) throw new ValidationError(`Ainda há ${open} parada(s) sem resultado. Registre cada uma como coletada ou não coletada.`)
    await this.routes.complete(route.id, [], undefined)
    return this.view(token)
  }

  // Guarda as fotos, executa a mudança de estado e só então registra as fotos.
  // Se a mudança de estado falhar, as fotos já enviadas ao armazenamento são apagadas.
  private async withPhotos(donationId: string, files: Buffer[], actor: StopActor, action: () => Promise<unknown>) {
    if (files.length === 0) {
      await action()
      return
    }
    const created = await this.photos.addPhotos({
      donationId,
      kind: PhotoKind.COLETA,
      files,
      uploadedByLabel: actor.label,
    })
    try {
      await action()
    } catch (error) {
      const rows = await prisma.donationPhoto.findMany({ where: { id: { in: created.map((c) => c.id) } } })
      await prisma.donationPhoto.deleteMany({ where: { id: { in: created.map((c) => c.id) } } })
      await Promise.allSettled(rows.map((r) => getStorage().remove(r.storageKey)))
      throw error
    }
  }
}
