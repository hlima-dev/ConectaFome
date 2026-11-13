import { describe, it, expect } from 'vitest'
import { DonationAction } from '@prisma/client'
import { planNotifications, type NotificationAudience } from '../src/services/notificationRules'

const audience: NotificationAudience = {
  actorId: undefined,
  donation: { description: 'Pães do dia', donorName: 'Padaria Central' },
  donorUserId: 'u-donor',
  recipientUserId: 'u-rec',
  recipientName: 'ONG Mesa Solidária',
  adminIds: ['u-admin'],
  nearbyRecipientUserIds: ['u-rec', 'u-rec2'],
}
const plan = (action: DonationAction, over: Partial<NotificationAudience> = {}) =>
  planNotifications(action, { ...audience, ...over })
const ids = (n: { userId: string }[]) => n.map((x) => x.userId).sort()

describe('notificationRules — planNotifications', () => {
  it('CRIADA avisa receptores da região e administradores, não o doador', () => {
    const result = plan(DonationAction.CRIADA, { actorId: 'u-donor' })
    expect(ids(result)).toEqual(['u-admin', 'u-rec', 'u-rec2'])
    expect(result.find((n) => n.userId === 'u-rec')?.message).toMatch(/Nova doação disponível: "Pães do dia" \(Padaria Central\)/)
  })

  it('RESERVADA (pelo receptor) avisa o doador e os administradores, não o próprio receptor', () => {
    const result = plan(DonationAction.RESERVADA, { actorId: 'u-rec' })
    expect(ids(result)).toEqual(['u-admin', 'u-donor'])
    expect(result[0].message).toContain('ONG Mesa Solidária reservou')
  })

  it('CASADA (pelo administrador) avisa doador e receptor, não o administrador', () => {
    const result = plan(DonationAction.CASADA, { actorId: 'u-admin' })
    expect(ids(result)).toEqual(['u-donor', 'u-rec'])
    expect(result.find((n) => n.userId === 'u-rec')?.message).toContain('reservada para você')
  })

  it('LIBERADA avisa doador e administradores', () => {
    expect(ids(plan(DonationAction.LIBERADA, { actorId: 'u-rec' }))).toEqual(['u-admin', 'u-donor'])
  })

  it('AGENDADA e DESAGENDADA avisam doador e receptor', () => {
    expect(ids(plan(DonationAction.AGENDADA, { actorId: 'u-admin' }))).toEqual(['u-donor', 'u-rec'])
    expect(ids(plan(DonationAction.DESAGENDADA, { actorId: 'u-admin' }))).toEqual(['u-donor', 'u-rec'])
  })

  it('COLETADA pede ao receptor que confirme o recebimento', () => {
    const result = plan(DonationAction.COLETADA, { actorId: 'u-admin' })
    expect(result.find((n) => n.userId === 'u-rec')?.message).toContain('Confirme o recebimento')
    expect(result.find((n) => n.userId === 'u-donor')?.message).toMatch(/foi coletada\.$/)
  })

  it('CONFIRMADA avisa só o doador', () => {
    expect(ids(plan(DonationAction.CONFIRMADA, { actorId: 'u-rec' }))).toEqual(['u-donor'])
  })

  it('COLETA_FALHOU avisa doador, receptor e administração, com o motivo', () => {
    const result = plan(DonationAction.COLETA_FALHOU, { detail: 'Doador ausente' })
    expect(ids(result)).toEqual(['u-admin', 'u-donor', 'u-rec'])
    expect(result[0].message).toBe('A coleta de "Pães do dia" não foi realizada: Doador ausente.')
  })

  it('CANCELADA e VENCIDA avisam quem não foi o autor', () => {
    expect(ids(plan(DonationAction.CANCELADA, { actorId: 'u-donor' }))).toEqual(['u-rec'])
    expect(ids(plan(DonationAction.VENCIDA, { actorId: 'u-admin' }))).toEqual(['u-donor', 'u-rec'])
  })

  it('nunca avisa o autor da ação, nem duplica um usuário, nem avisa quem não tem login', () => {
    // o administrador é também a conta do doador: recebe uma vez só
    const result = plan(DonationAction.RESERVADA, { donorUserId: 'u-admin' })
    expect(result.filter((n) => n.userId === 'u-admin')).toHaveLength(1)
    // doação sem receptor e doador sem login: ninguém a avisar além dos admins
    expect(ids(plan(DonationAction.CANCELADA, { donorUserId: null, recipientUserId: null }))).toEqual([])
  })

  it('usa um texto neutro quando não há receptor', () => {
    const result = plan(DonationAction.RESERVADA, { recipientName: null, actorId: 'x' })
    expect(result[0].message).toContain('um receptor reservou')
  })
})
