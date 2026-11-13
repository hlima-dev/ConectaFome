import { DonationAction, Role } from '@prisma/client'
import { prisma } from '../config/prisma'
import { NotFoundError } from '../utils/AppError'
import { planNotifications } from './notificationRules'

export class NotificationService {
  // Gera os avisos de um evento da doação. É "melhor esforço": roda depois da
  // transição já gravada e uma falha aqui nunca pode desfazer ou travar a
  // ação principal (o histórico da doação é a fonte de verdade, o sino é
  // conveniência).
  async onDonationEvent(action: DonationAction, donationId: string, actorId?: string): Promise<void> {
    try {
      const donation = await prisma.donation.findUnique({
        where: { id: donationId },
        include: { donor: true, recipient: true },
      })
      if (!donation) return

      const [admins, nearby] = await Promise.all([
        prisma.user.findMany({ where: { role: Role.ADMIN, active: true }, select: { id: true } }),
        action === DonationAction.CRIADA ? this.nearbyRecipientUserIds(donation.donor.city) : Promise.resolve([]),
      ])

      const planned = planNotifications(action, {
        actorId,
        donation: { description: donation.description, donorName: donation.donor.name },
        donorUserId: donation.donor.userId,
        recipientUserId: donation.recipient?.userId ?? null,
        recipientName: donation.recipient?.name ?? null,
        adminIds: admins.map((a) => a.id),
        nearbyRecipientUserIds: nearby,
      })

      if (planned.length > 0) {
        await prisma.notification.createMany({
          data: planned.map((n) => ({ userId: n.userId, donationId, action, message: n.message })),
        })
      }
    } catch (error) {
      console.error('Falha ao gerar notificações da doação', donationId, error)
    }
  }

  // Aviso administrativo (sem doação): novo cadastro, aprovação, etc. Também é
  // melhor esforço — nunca pode derrubar a ação que o originou.
  async notifyUsers(userIds: string[], message: string, link?: string): Promise<void> {
    try {
      const unique = [...new Set(userIds)]
      if (unique.length === 0) return
      await prisma.notification.createMany({ data: unique.map((userId) => ({ userId, message, link })) })
    } catch (error) {
      console.error('Falha ao gerar notificação', error)
    }
  }

  async notifyAdmins(message: string, link?: string): Promise<void> {
    try {
      const admins = await prisma.user.findMany({ where: { role: Role.ADMIN, active: true }, select: { id: true } })
      await this.notifyUsers(admins.map((a) => a.id), message, link)
    } catch (error) {
      console.error('Falha ao avisar administradores', error)
    }
  }

  // Receptores ativos da mesma cidade do doador; se o doador não informou
  // cidade, avisa todos os receptores ativos (melhor avisar a mais que a menos).
  private async nearbyRecipientUserIds(city: string | null): Promise<string[]> {
    const recipients = await prisma.recipient.findMany({
      where: {
        active: true,
        userId: { not: null },
        ...(city ? { city: { equals: city, mode: 'insensitive' as const } } : {}),
      },
      select: { userId: true },
    })
    return recipients.map((r) => r.userId).filter((id): id is string => !!id)
  }

  async list(userId: string, options: { unreadOnly?: boolean; limit?: number } = {}) {
    const limit = Math.min(50, Math.max(1, options.limit ?? 20))
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { userId, ...(options.unreadOnly ? { readAt: null } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ])
    return { items, unreadCount }
  }

  async markRead(id: string, userId: string) {
    const notification = await prisma.notification.findFirst({ where: { id, userId } })
    if (!notification) {
      throw new NotFoundError('Notificação')
    }
    if (notification.readAt) return notification

    return prisma.notification.update({ where: { id }, data: { readAt: new Date() } })
  }

  async markAllRead(userId: string) {
    const result = await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })
    return { updated: result.count }
  }
}
