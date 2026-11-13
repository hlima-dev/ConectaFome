import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import bcrypt from 'bcryptjs'
import { ApprovalStatus, DonationStatus, RecipientType, Role } from '@prisma/client'

// Navegação e visualização: busca e filtros da lista, central de pendências da
// administração e verificação pública do comprovante (QR code).
let server: Server
let base: string
let prisma: typeof import('../../src/config/prisma').prisma
const tokens: Record<string, string> = {}
const hours = (h: number) => new Date(Date.now() + h * 3_600_000)

const call = (method: string, path: string, who: string | null) =>
  fetch(`${base}/api/v1${path}`, { method, headers: who ? { Authorization: `Bearer ${tokens[who]}` } : {} })

describe('navegação: busca, pendências e verificação do comprovante', () => {
  const ids: Record<string, string> = {}
  const numbers: Record<string, number> = {}

  beforeAll(async () => {
    ;({ prisma } = await import('../../src/config/prisma'))
    const { app } = await import('../../src/app')
    const { generateTokenPair } = await import('../../src/utils/jwt')
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE notifications, donation_events, donation_photos, donations, pickup_route_access, pickup_routes, vehicles, volunteers, donors, recipients, password_reset_tokens, users RESTART IDENTITY CASCADE',
    )
    const pw = await bcrypt.hash('Senha@12345', 4)
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin@t.org', password: pw, role: Role.ADMIN } })
    tokens.admin = generateTokenPair({ sub: admin.id, role: Role.ADMIN }).accessToken
    const donorUser = await prisma.user.create({
      data: { name: 'Dono', email: 'dono@t.org', password: pw, role: Role.DOADOR, donorProfile: { create: { name: 'Padaria Central', city: 'Sorocaba', document: '11.222.333/0001-81', address: 'Rua Secreta, 99' } } },
      include: { donorProfile: true },
    })
    tokens.doador = generateTokenPair({ sub: donorUser.id, role: Role.DOADOR }).accessToken
    const ong = await prisma.recipient.create({ data: { name: 'ONG Mesa Solidária', type: RecipientType.ONG, city: 'Sorocaba' } })
    const familia = await prisma.recipient.create({ data: { name: 'Família Silva', type: RecipientType.FAMILIA, city: 'Sorocaba' } })
    // um cadastro aguardando aprovação
    await prisma.user.create({
      data: { name: 'Novo', email: 'novo@t.org', password: pw, role: Role.RECEPTOR, approvalStatus: ApprovalStatus.PENDENTE, recipientProfile: { create: { name: 'ONG Nova' } } },
    })

    const donorId = donorUser.donorProfile!.id
    const base_ = { donorId, estimatedQuantityKg: 10, pickupWindowStart: hours(-60) }
    const mk = async (key: string, data: Record<string, unknown>) => {
      const d = await prisma.donation.create({ data: { ...base_, description: key, ...data } as never })
      ids[key] = d.id
      numbers[key] = d.number
    }
    await mk('Pães urgentes', { pickupWindowEnd: hours(5) })
    await mk('Leite tranquilo', { pickupWindowEnd: hours(100) })
    await mk('Arroz reservado', { pickupWindowEnd: hours(100), status: DonationStatus.RESERVADA, recipientId: ong.id, matchedAt: hours(-30) })
    await mk('Feijão coletado', { pickupWindowEnd: hours(10), status: DonationStatus.COLETADA, recipientId: ong.id, collectedAt: hours(-30), collectedQuantityKg: 9 })
    await mk('Macarrão da família', { pickupWindowEnd: hours(10), status: DonationStatus.ENTREGUE, recipientId: familia.id, collectedAt: hours(-30), confirmedAt: hours(-20), collectedQuantityKg: 7 })
    await mk('Frutas atrasadas', { pickupWindowEnd: hours(-3), status: DonationStatus.AGENDADA, recipientId: ong.id })

    const vehicle = await prisma.vehicle.create({ data: { plate: 'AAA1B23', model: 'Van', capacityKg: 500 } })
    const volunteer = await prisma.volunteer.create({ data: { name: 'Carlos', document: '529.982.247-25' } })
    await prisma.pickupRoute.create({ data: { vehicleId: vehicle.id, volunteerId: volunteer.id, scheduledFor: hours(2) } })

    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await prisma.$disconnect()
  })

  describe('lista de doações', () => {
    const search = async (qs: string) => ((await (await call('GET', `/donations?${qs}`, 'admin')).json()).data.data as { description: string; number: number }[])

    it('cada doação tem um número sequencial', () => {
      expect(Object.values(numbers).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6])
    })

    it('busca por texto na descrição, no doador e no receptor', async () => {
      expect((await search('q=pães')).map((d) => d.description)).toEqual(['Pães urgentes'])
      expect(await search('q=Padaria')).toHaveLength(6)
      expect((await search('q=Mesa%20Solid')).map((d) => d.description).sort()).toEqual(['Arroz reservado', 'Feijão coletado', 'Frutas atrasadas'])
    })

    it('busca pelo código da doação, em formatos de digitação comuns', async () => {
      const n = numbers['Leite tranquilo']
      expect((await search(`q=DOA-${String(n).padStart(5, '0')}`)).map((d) => d.description)).toEqual(['Leite tranquilo'])
      expect((await search(`q=doa${n}`)).map((d) => d.description)).toEqual(['Leite tranquilo'])
    })

    it('ordena por quem vence primeiro', async () => {
      const rows = await search('sort=prazo&status=DISPONIVEL')
      expect(rows.map((d) => d.description)).toEqual(['Pães urgentes', 'Leite tranquilo'])
    })

    it('filtra por período de registro (inclusivo) e valida o formato', async () => {
      const today = new Date().toISOString().slice(0, 10)
      expect(await search(`from=${today}&to=${today}`)).toHaveLength(6)
      expect(await search('from=2020-01-01&to=2020-01-02')).toHaveLength(0)
      expect((await call('GET', '/donations?from=ontem', 'admin')).status).toBe(422)
    })

    it('paginação devolve o total', async () => {
      const res = await call('GET', '/donations?limit=2&page=2', 'admin')
      const body = (await res.json()).data
      expect(body.data).toHaveLength(2)
      expect(body.meta).toMatchObject({ total: 6, page: 2, limit: 2, totalPages: 3, hasPrev: true, hasNext: true })
    })
  })

  describe('central de pendências', () => {
    it('só a administração vê', async () => {
      expect((await call('GET', '/reports/pending', 'doador')).status).toBe(403)
      expect((await call('GET', '/reports/pending', null)).status).toBe(401)
    })

    it('agrupa o que precisa de ação, com contagem e itens', async () => {
      const res = await call('GET', '/reports/pending', 'admin')
      expect(res.status).toBe(200)
      const p = (await res.json()).data

      expect(p.approvals.count).toBe(1)
      expect(p.approvals.items[0]).toMatchObject({ kind: 'recipient', name: 'ONG Nova' })

      expect(p.urgentAvailable.count).toBe(1)
      expect(p.urgentAvailable.items[0]).toMatchObject({ description: 'Pães urgentes', donorName: 'Padaria Central' })
      expect(p.urgentAvailable.items[0].hoursLeft).toBeGreaterThan(4)

      expect(p.reservedWithoutRoute.count).toBe(1)
      expect(p.reservedWithoutRoute.items[0]).toMatchObject({ description: 'Arroz reservado', recipientName: 'ONG Mesa Solidária' })
      expect(p.reservedWithoutRoute.items[0].waitingHours).toBeGreaterThan(29)

      expect(p.awaitingConfirmation.count).toBe(1)
      expect(p.awaitingConfirmation.items[0].description).toBe('Feijão coletado')

      expect(p.overdueScheduled.count).toBe(1)
      expect(p.overdueScheduled.items[0].description).toBe('Frutas atrasadas')

      expect(p.routesToday.count).toBe(1)
      expect(p.routesToday.items[0]).toMatchObject({ routeNumber: 1, status: 'PLANEJADA', volunteerName: 'Carlos' })

      expect(p.total).toBe(5)
    })
  })

  describe('comprovante e verificação pública', () => {
    let code: string
    let signature: string

    it('o comprovante traz o código e a assinatura do QR', async () => {
      const res = await call('GET', `/donations/${ids['Feijão coletado']}/receipt`, 'admin')
      expect(res.status).toBe(200)
      const receipt = (await res.json()).data
      expect(receipt.number).toBe(`DOA-${String(numbers['Feijão coletado']).padStart(5, '0')}`)
      code = receipt.verification.code
      signature = receipt.verification.signature
      expect(signature).toMatch(/^[0-9a-f]{20}$/)
    })

    it('qualquer pessoa confere o comprovante, sem login, e só vê o mínimo', async () => {
      const res = await call('GET', `/public/receipts/${code}/${signature}`, null)
      expect(res.status).toBe(200)
      const data = (await res.json()).data
      expect(data).toMatchObject({ valid: true, code, description: 'Feijão coletado', status: 'COLETADA', collectedQuantityKg: 9, donorName: 'Padaria Central', recipientName: 'ONG Mesa Solidária' })
      const text = JSON.stringify(data)
      expect(text).not.toContain('Rua Secreta')
      expect(text).not.toContain('11.222.333')
    })

    it('o nome de uma família atendida não aparece', async () => {
      const c = `DOA-${String(numbers['Macarrão da família']).padStart(5, '0')}`
      const { receiptSignature } = await import('../../src/utils/donationCode')
      const res = await call('GET', `/public/receipts/${c}/${receiptSignature(c)}`, null)
      expect((await res.json()).data.recipientName).toBe('Família atendida')
    })

    it('assinatura errada, código inexistente ou doação não coletada: 404 igual', async () => {
      const wrong = await call('GET', `/public/receipts/${code}/${'0'.repeat(20)}`, null)
      expect(wrong.status).toBe(404)
      const missingCode = 'DOA-99999'
      const { receiptSignature } = await import('../../src/utils/donationCode')
      const missing = await call('GET', `/public/receipts/${missingCode}/${receiptSignature(missingCode)}`, null)
      expect(missing.status).toBe(404)
      const notCollected = `DOA-${String(numbers['Leite tranquilo']).padStart(5, '0')}`
      const early = await call('GET', `/public/receipts/${notCollected}/${receiptSignature(notCollected)}`, null)
      expect(early.status).toBe(404)
      expect((await wrong.json()).message).toBe((await early.json()).message)
    })
  })
})
