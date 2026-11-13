import { DonationAction, DonationStatus, Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'

type TransitionData = Omit<Prisma.DonationUncheckedUpdateInput, 'status'> & { status: DonationStatus }

// Toda mudança de estado de uma doação passa por aqui: devolve as duas
// operações (atualizar a doação + gravar o evento no histórico) para o
// chamador rodá-las na MESMA transação. Assim nunca existe uma doação que
// mudou de estado sem registro de quem mudou e quando.
export function donationTransition(
  donation: { id: string; status: DonationStatus },
  action: DonationAction,
  data: TransitionData,
  actorId?: string,
  extra: { actorLabel?: string; detail?: string } = {},
) {
  return [
    prisma.donation.update({ where: { id: donation.id }, data }),
    prisma.donationEvent.create({
      data: {
        donationId: donation.id,
        action,
        fromStatus: donation.status,
        toStatus: data.status,
        actorId: actorId ?? null,
        ...(extra.actorLabel ? { actorLabel: extra.actorLabel } : {}),
        ...(extra.detail ? { detail: extra.detail } : {}),
      },
    }),
  ] as const
}
