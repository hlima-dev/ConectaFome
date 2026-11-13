import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import bcrypt from 'bcryptjs'
import { DonationAction, DonationStatus, Role } from '@prisma/client'

// Confiança do sistema, de ponta a ponta com Express e PostgreSQL reais:
// documento válido, aprovação de cadastros e manutenção automática.
process.env.CRON_SECRET = 'segredo-de-teste-com-mais-de-24-caracteres'
process.env.RESERVATION_HOLD_HOURS = '24'

let server: Server
let base: string
let prisma: typeof import('../../src/config/prisma').prisma
const tokens: Record<string, string> = {}
const hours = (h: number) => new Date(Date.now() + h * 3_600_000)

const call = (method: string, path: string, who: string | null, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const registerBody = (over: Record<string, unknown> = {}) => ({
  name: 'Maria', email: 'maria@ong.org', password: 'Senha@12345', role: 'RECEPTOR',
  recipient: { name: 'ONG Esperança', type: 'ONG', document: '11.222.333/0001-81', city: 'Sorocaba' },
  ...over,
})

async function tokenFor(userId: string, role: Role, key: string) {
  const { generateTokenPair } = await import('../../src/utils/jwt')
  tokens[key] = generateTokenPair({ sub: userId, role }).accessToken
}

describe('confiança: documento, aprovação e manutenção', () => {
  let admin: { id: string }
  let approvedDonorId: string
  let pendingRecipientProfileId: string
  let pendingRecipientUserId: string

  beforeAll(async () => {
    ;({ prisma } = await import('../../src/config/prisma'))
    const { app } = await import('../../src/app')
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE notifications, donation_events, donations, pickup_routes, vehicles, volunteers, donors, recipients, users RESTART IDENTITY CASCADE',
    )
    admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin@t.org', password: await bcrypt.hash('Senha@12345', 4), role: Role.ADMIN } })
    await tokenFor(admin.id, Role.ADMIN, 'admin')
    const donor = await prisma.donor.create({
      data: { name: 'Mercado', city: 'Sorocaba', user: { create: { name: 'Dono', email: 'dono@t.org', password: 'x', role: Role.DOADOR } } },
    })
    approvedDonorId = donor.id
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await prisma.$disconnect()
  })

  describe('documento no cadastro público', () => {
    it('sem documento: 422', async () => {
      const res = await call('POST', '/auth/register', null, registerBody({ recipient: { name: 'ONG', type: 'ONG', city: 'X' } }))
      expect(res.status).toBe(422)
    })

    it('com documento inválido: 422', async () => {
      const res = await call('POST', '/auth/register', null, registerBody({ recipient: { name: 'ONG', type: 'ONG', document: '11.222.333/0001-80' } }))
      expect(res.status).toBe(422)
    })
  })

  describe('aprovação de cadastros', () => {
    it('cadastro público entra PENDENTE, com documento padronizado, e a administração é avisada', async () => {
      const res = await call('POST', '/auth/register', null, registerBody({ recipient: { name: 'ONG Esperança', type: 'ONG', document: '11222333000181', city: 'Sorocaba' } }))
      expect(res.status).toBe(201)
      const body = await res.json()
      expect(body.data.user.approvalStatus).toBe('PENDENTE')
      pendingRecipientUserId = body.data.user.id
      await tokenFor(pendingRecipientUserId, Role.RECEPTOR, 'pendente')

      const profile = await prisma.recipient.findFirstOrThrow({ where: { userId: pendingRecipientUserId } })
      pendingRecipientProfileId = profile.id
      expect(profile.document).toBe('11.222.333/0001-81')

      const notes = await prisma.notification.findMany({ where: { userId: admin.id } })
      expect(notes.some((n) => n.message.includes('aguardando aprovação') && n.link === '/receptores')).toBe(true)
    })

    it('receptor pendente não reserva: 403 com mensagem de análise', async () => {
      const donation = await prisma.donation.create({
        data: { donorId: approvedDonorId, description: 'Arroz', estimatedQuantityKg: 10, pickupWindowStart: hours(-1), pickupWindowEnd: hours(30) },
      })
      const res = await call('PATCH', `/donations/${donation.id}/reserve`, 'pendente')
      expect(res.status).toBe(403)
      expect((await res.json()).message).toMatch(/em análise/)
    })

    it('doador pendente não registra doação: 403', async () => {
      const res = await call('POST', '/auth/register', null, registerBody({
        email: 'novo@mercado.org', role: 'DOADOR', recipient: undefined,
        donor: { name: 'Padaria Nova', type: 'OUTRO', document: '529.982.247-25', city: 'Sorocaba' },
      }))
      expect(res.status).toBe(201)
      await tokenFor((await res.json()).data.user.id, Role.DOADOR, 'doadorpendente')
      const create = await call('POST', '/donations', 'doadorpendente', {
        description: 'Pães', estimatedQuantityKg: 3, category: 'PADARIA', acceptTerms: true,
        pickupWindowStart: hours(0).toISOString(), pickupWindowEnd: hours(8).toISOString(),
      })
      expect(create.status).toBe(403)
    })

    it('só a administração aprova; receptor não consegue se auto-aprovar', async () => {
      const self = await call('PATCH', `/recipients/${pendingRecipientProfileId}/approval`, 'pendente', { status: 'APROVADO' })
      expect(self.status).toBe(403)
      expect((await prisma.user.findUniqueOrThrow({ where: { id: pendingRecipientUserId } })).approvalStatus).toBe('PENDENTE')
    })

    it('a lista de receptores filtra por pendentes e traz a situação', async () => {
      const res = await call('GET', '/recipients?approval=PENDENTE', 'admin')
      const rows = (await res.json()).data.data
      expect(rows).toHaveLength(1)
      expect(rows[0].user.approvalStatus).toBe('PENDENTE')
    })

    it('depois de aprovado, o receptor reserva e recebe o aviso de aprovação', async () => {
      const approve = await call('PATCH', `/recipients/${pendingRecipientProfileId}/approval`, 'admin', { status: 'APROVADO' })
      expect(approve.status).toBe(200)

      const notes = await prisma.notification.findMany({ where: { userId: pendingRecipientUserId } })
      expect(notes.some((n) => n.message.includes('aprovado'))).toBe(true)

      const donation = await prisma.donation.findFirstOrThrow({ where: { description: 'Arroz' } })
      const res = await call('PATCH', `/donations/${donation.id}/reserve`, 'pendente')
      expect(res.status).toBe(200)
    })

    it('rejeitado volta a ser barrado, com o motivo guardado', async () => {
      await call('PATCH', `/recipients/${pendingRecipientProfileId}/approval`, 'admin', { status: 'REJEITADO', note: 'CNPJ não confere' })
      const user = await prisma.user.findUniqueOrThrow({ where: { id: pendingRecipientUserId } })
      expect(user.approvalStatus).toBe('REJEITADO')
      expect(user.approvalNote).toBe('CNPJ não confere')
    })
  })

  describe('manutenção automática', () => {
    it('a rota do agendador exige o segredo', async () => {
      expect((await call('POST', '/maintenance/run', null)).status).toBe(403)
      expect((await call('POST', '/maintenance/run', null, undefined, { 'X-Cron-Secret': 'errado-errado-errado-errado' })).status).toBe(403)
    })

    it('vence o que passou do prazo, solta reserva parada e preserva o casamento da administração', async () => {
      const recipient = await prisma.recipient.findFirstOrThrow({ where: { userId: pendingRecipientUserId } })
      const base = { donorId: approvedDonorId, estimatedQuantityKg: 5, pickupWindowStart: hours(-60) }

      const overdue = await prisma.donation.create({ data: { ...base, description: 'Vencida', pickupWindowEnd: hours(-2) } })
      const inTime = await prisma.donation.create({ data: { ...base, description: 'No prazo', pickupWindowEnd: hours(48) } })

      const stale = await prisma.donation.create({
        data: { ...base, description: 'Reserva parada', pickupWindowEnd: hours(48), status: DonationStatus.RESERVADA, recipientId: recipient.id, matchedAt: hours(-30) },
      })
      await prisma.donationEvent.create({ data: { donationId: stale.id, action: DonationAction.RESERVADA, toStatus: DonationStatus.RESERVADA } })

      const byAdmin = await prisma.donation.create({
        data: { ...base, description: 'Casada pelo admin', pickupWindowEnd: hours(48), status: DonationStatus.RESERVADA, recipientId: recipient.id, matchedAt: hours(-30) },
      })
      await prisma.donationEvent.create({ data: { donationId: byAdmin.id, action: DonationAction.CASADA, toStatus: DonationStatus.RESERVADA, actorId: admin.id } })

      const res = await call('POST', '/maintenance/run', null, undefined, { 'X-Cron-Secret': process.env.CRON_SECRET! })
      expect(res.status).toBe(200)
      const out = (await res.json()).data
      expect(out.expired).toBeGreaterThanOrEqual(1)
      expect(out.released).toBe(1)

      expect((await prisma.donation.findUniqueOrThrow({ where: { id: overdue.id } })).status).toBe('VENCIDA')
      expect((await prisma.donation.findUniqueOrThrow({ where: { id: inTime.id } })).status).toBe('DISPONIVEL')
      const released = await prisma.donation.findUniqueOrThrow({ where: { id: stale.id } })
      expect(released.status).toBe('DISPONIVEL')
      expect(released.recipientId).toBeNull()
      expect((await prisma.donation.findUniqueOrThrow({ where: { id: byAdmin.id } })).status).toBe('RESERVADA')

      // evento de sistema (sem autor) e aviso ao receptor que perdeu a reserva
      const ev = await prisma.donationEvent.findFirstOrThrow({ where: { donationId: overdue.id, action: 'VENCIDA' } })
      expect(ev.actorId).toBeNull()
      const note = await prisma.notification.findFirst({ where: { userId: pendingRecipientUserId, message: { contains: 'expirou' } } })
      expect(note?.link).toBe(`/doacoes/${stale.id}`)
    })

    it('é idempotente: rodar de novo não muda mais nada', async () => {
      const res = await call('POST', '/maintenance/run-now', 'admin')
      expect(res.status).toBe(200)
      const out = (await res.json()).data
      expect(out.expired).toBe(0)
      expect(out.released).toBe(0)
    })

    it('o botão do administrador não é aberto a outros papéis', async () => {
      expect((await call('POST', '/maintenance/run-now', 'doadorpendente')).status).toBe(403)
    })
  })
})
