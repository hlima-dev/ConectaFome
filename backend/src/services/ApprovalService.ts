import { ApprovalStatus } from '@prisma/client'
import { prisma } from '../config/prisma'
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/AppError'
import { NotificationService } from './NotificationService'

// Cadastro em análise ou rejeitado não opera: não registra doação nem reserva.
// Chamado nas ações que dependem de confiança (doar, reservar).
export async function assertApproved(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { approvalStatus: true } })
  if (!user) throw new ForbiddenError('Usuário não encontrado')
  if (user.approvalStatus === ApprovalStatus.REJEITADO) {
    throw new ForbiddenError('Seu cadastro não foi aprovado. Fale com a administração.')
  }
  if (user.approvalStatus !== ApprovalStatus.APROVADO) {
    throw new ForbiddenError('Seu cadastro ainda está em análise pela administração. Assim que for aprovado você poderá operar.')
  }
}

export class ApprovalService {
  private notifications = new NotificationService()

  // Aprova, rejeita ou devolve para análise o acesso de um doador/receptor.
  // O motivo (opcional) vai para o próprio usuário.
  async setStatus(kind: 'donor' | 'recipient', profileId: string, status: ApprovalStatus, note: string | undefined) {
    const profile =
      kind === 'donor'
        ? await prisma.donor.findUnique({ where: { id: profileId }, select: { userId: true, name: true } })
        : await prisma.recipient.findUnique({ where: { id: profileId }, select: { userId: true, name: true } })
    if (!profile) throw new NotFoundError(kind === 'donor' ? 'Doador' : 'Receptor')
    if (!profile.userId) {
      throw new ValidationError('Este cadastro não tem conta de acesso, então não há o que aprovar')
    }

    const updated = await prisma.user.update({
      where: { id: profile.userId },
      data: {
        approvalStatus: status,
        approvalNote: note?.trim() || null,
        approvedAt: status === ApprovalStatus.APROVADO ? new Date() : null,
      },
      select: { id: true, approvalStatus: true, approvalNote: true, approvedAt: true },
    })

    const message =
      status === ApprovalStatus.APROVADO
        ? 'Seu cadastro foi aprovado. Você já pode usar o ConectaFome.'
        : status === ApprovalStatus.REJEITADO
          ? `Seu cadastro não foi aprovado.${note?.trim() ? ` Motivo: ${note.trim()}` : ''}`
          : 'Seu cadastro voltou para análise.'
    await this.notifications.notifyUsers([profile.userId], message, '/')

    return updated
  }
}
