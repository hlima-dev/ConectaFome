import { DonationAction } from '@prisma/client'

export interface NotificationAudience {
  actorId?: string
  donation: { description: string; donorName: string }
  donorUserId: string | null
  recipientUserId: string | null
  recipientName: string | null
  adminIds: string[]
  // Usuários de receptores ativos na cidade do doador — só usado em CRIADA.
  nearbyRecipientUserIds: string[]
  // Informação extra do evento (ex.: motivo da coleta que falhou).
  detail?: string
}

export interface PlannedNotification {
  userId: string
  message: string
}

// Regra pura: dado o que aconteceu e quem está envolvido, quem recebe qual
// aviso. Nunca avisa o próprio autor da ação e nunca duplica um usuário.
export function planNotifications(action: DonationAction, a: NotificationAudience): PlannedNotification[] {
  const d = `"${a.donation.description}"`
  const recipient = a.recipientName ?? 'um receptor'
  const out: { userId: string | null; message: string }[] = []
  const to = (userIds: (string | null)[], message: string) => userIds.forEach((userId) => out.push({ userId, message }))

  switch (action) {
    case DonationAction.CRIADA:
      to(a.nearbyRecipientUserIds, `Nova doação disponível: ${d} (${a.donation.donorName}).`)
      to(a.adminIds, `Nova doação registrada por ${a.donation.donorName}: ${d}.`)
      break
    case DonationAction.RESERVADA:
      to([a.donorUserId, ...a.adminIds], `${recipient} reservou ${d}.`)
      break
    case DonationAction.CASADA:
      to([a.donorUserId], `${d} foi reservada para ${recipient}.`)
      to([a.recipientUserId], `A doação ${d} foi reservada para você.`)
      break
    case DonationAction.LIBERADA:
      to([a.donorUserId, ...a.adminIds], `A reserva de ${d} foi desfeita e a doação voltou a ficar disponível.`)
      break
    case DonationAction.AGENDADA:
      to([a.donorUserId, a.recipientUserId], `${d} foi incluída em uma rota de coleta.`)
      break
    case DonationAction.DESAGENDADA:
      to([a.donorUserId, a.recipientUserId], `${d} saiu da rota de coleta e voltou a ficar reservada.`)
      break
    case DonationAction.COLETADA:
      to([a.recipientUserId], `${d} foi coletada. Confirme o recebimento quando chegar.`)
      to([a.donorUserId], `${d} foi coletada.`)
      break
    case DonationAction.CONFIRMADA:
      to([a.donorUserId], `${recipient} confirmou o recebimento de ${d}.`)
      break
    case DonationAction.COLETA_FALHOU:
      to([a.donorUserId, a.recipientUserId, ...a.adminIds], `A coleta de ${d} não foi realizada${a.detail ? `: ${a.detail}` : ''}.`)
      break
    case DonationAction.CANCELADA:
      to([a.donorUserId, a.recipientUserId], `${d} foi cancelada.`)
      break
    case DonationAction.VENCIDA:
      to([a.donorUserId, a.recipientUserId], `${d} foi marcada como vencida.`)
      break
  }

  const seen = new Set<string>()
  const result: PlannedNotification[] = []
  for (const { userId, message } of out) {
    if (!userId || userId === a.actorId || seen.has(userId)) continue
    seen.add(userId)
    result.push({ userId, message })
  }
  return result
}
