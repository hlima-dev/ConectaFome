import { DonationAction, DonationStatus } from '@prisma/client'
import { prisma } from '../config/prisma'
import { env } from '../config/env'
import { computeUrgency } from '../utils/urgency'
import { NotificationService } from './NotificationService'

// Teto por execução, para uma rodada nunca ficar longa demais.
const BATCH = 500

export interface MaintenanceResult {
  ranAt: Date
  expired: number
  released: number
}

// Rotina de manutenção. Roda por um agendador EXTERNO (GitHub Actions chamando
// POST /api/v1/maintenance/run), porque o servidor gratuito do Render dorme
// quando fica sem uso e um temporizador interno não rodaria. É idempotente:
// pode rodar a qualquer hora e quantas vezes for.
export class MaintenanceService {
  private notifications = new NotificationService()

  async run(now: Date = new Date()): Promise<MaintenanceResult> {
    const expired = await this.expireOverdue(now)
    const released = await this.releaseStaleReservations(now)
    return { ranAt: now, expired, released }
  }

  // Doação disponível ou reservada cujo prazo (validade ou fim da janela)
  // passou vira VENCIDA. Agendadas e em rota NÃO são mexidas aqui: já há
  // alguém a caminho e a decisão é humana (aparece na central de pendências).
  async expireOverdue(now: Date): Promise<number> {
    const candidates = await prisma.donation.findMany({
      where: {
        status: { in: [DonationStatus.DISPONIVEL, DonationStatus.RESERVADA] },
        routeId: null,
        OR: [{ pickupWindowEnd: { lt: now } }, { bestBeforeDate: { lt: now } }],
      },
      take: BATCH,
    })

    let count = 0
    for (const donation of candidates) {
      if (computeUrgency(donation, now)?.level !== 'EXPIRED') continue

      const done = await prisma.$transaction(async (tx) => {
        const result = await tx.donation.updateMany({
          where: { id: donation.id, status: donation.status, routeId: null },
          data: { status: DonationStatus.VENCIDA, expiredAt: now },
        })
        if (result.count === 0) return false
        await tx.donationEvent.create({
          data: { donationId: donation.id, action: DonationAction.VENCIDA, fromStatus: donation.status, toStatus: DonationStatus.VENCIDA, actorId: null },
        })
        return true
      })

      if (done) {
        count += 1
        await this.notifications.onDonationEvent(DonationAction.VENCIDA, donation.id)
      }
    }
    return count
  }

  // Reserva feita pelo próprio receptor que ficou parada sem rota além do
  // limite (RESERVATION_HOLD_HOURS) volta ao painel: a comida não pode ficar
  // "presa" a quem sumiu. Casamento feito pela administração não expira.
  async releaseStaleReservations(now: Date): Promise<number> {
    if (env.RESERVATION_HOLD_HOURS <= 0) return 0
    const cutoff = new Date(now.getTime() - env.RESERVATION_HOLD_HOURS * 3_600_000)

    const candidates = await prisma.donation.findMany({
      where: { status: DonationStatus.RESERVADA, routeId: null, matchedAt: { lt: cutoff } },
      include: { recipient: { select: { userId: true, name: true } } },
      take: BATCH,
    })

    let count = 0
    for (const donation of candidates) {
      const last = await prisma.donationEvent.findFirst({
        where: { donationId: donation.id },
        orderBy: { createdAt: 'desc' },
        select: { action: true },
      })
      if (last?.action !== DonationAction.RESERVADA) continue

      const done = await prisma.$transaction(async (tx) => {
        const result = await tx.donation.updateMany({
          where: { id: donation.id, status: DonationStatus.RESERVADA, routeId: null, matchedAt: { lt: cutoff } },
          data: { status: DonationStatus.DISPONIVEL, recipientId: null, matchedAt: null },
        })
        if (result.count === 0) return false
        await tx.donationEvent.create({
          data: { donationId: donation.id, action: DonationAction.LIBERADA, fromStatus: DonationStatus.RESERVADA, toStatus: DonationStatus.DISPONIVEL, actorId: null },
        })
        return true
      })

      if (done) {
        count += 1
        if (donation.recipient?.userId) {
          await this.notifications.notifyUsers(
            [donation.recipient.userId],
            `Sua reserva de "${donation.description}" expirou por não ter coleta agendada em ${env.RESERVATION_HOLD_HOURS} h e a doação voltou ao painel.`,
            `/doacoes/${donation.id}`,
          )
        }
        await this.notifications.onDonationEvent(DonationAction.LIBERADA, donation.id)
      }
    }
    return count
  }
}
