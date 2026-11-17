import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import bcrypt from 'bcryptjs'
import { DonationStatus, Role } from '@prisma/client'

// Série do gráfico de relatórios e filtros por período, com PostgreSQL real.
let server: Server
let base: string
let prisma: typeof import('../../src/config/prisma').prisma
const tokens: Record<string, string> = {}
const ids: Record<string, string> = {}

const get = (path: string, who: string | null = 'admin') =>
  fetch(`${base}/api/v1${path}`, { headers: who ? { Authorization: `Bearer ${tokens[who]}` } : {} })

describe('relatórios: série por dia, semana e mês', () => {
  beforeAll(async () => {
    ;({ prisma } = await import('../../src/config/prisma'))
    const { app } = await import('../../src/app')
    const { generateTokenPair } = await import('../../src/utils/jwt')
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE notifications, donation_events, donation_photos, donations, pickup_route_access, pickup_routes, vehicles, volunteers, donors, recipients, password_reset_tokens, users RESTART IDENTITY CASCADE',
    )
    const pw = await bcrypt.hash('Senha@12345', 4)
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin@t.org', password: pw, role: Role.ADMIN } })
    const donorUser = await prisma.user.create({ data: { name: 'Dono', email: 'dono@t.org', password: pw, role: Role.DOADOR } })
    tokens.admin = generateTokenPair({ sub: admin.id, role: Role.ADMIN }).accessToken
    tokens.doador = generateTokenPair({ sub: donorUser.id, role: Role.DOADOR }).accessToken

    const a = await prisma.donor.create({ data: { name: 'Padaria A' } })
    const b = await prisma.donor.create({ data: { name: 'Mercado B' } })
    ids.a = a.id
    const ong = await prisma.recipient.create({ data: { name: 'ONG Mesa' } })

    const mk = (donorId: string, kg: number, collectedAtUtc: string, status: DonationStatus = DonationStatus.ENTREGUE) =>
      prisma.donation.create({
        data: {
          donorId, recipientId: ong.id, description: `Doação ${kg}`, estimatedQuantityKg: kg, collectedQuantityKg: kg, status,
          pickupWindowStart: new Date('2026-11-01T00:00:00Z'), pickupWindowEnd: new Date('2026-12-30T00:00:00Z'), collectedAt: new Date(collectedAtUtc),
        },
      })
    // 10/11 (terça) 14:00 BRT, duas coletas no mesmo dia
    await mk(a.id, 10, '2026-11-10T17:00:00Z')
    await mk(b.id, 5, '2026-11-10T18:00:00Z')
    // 12/11 (quinta) 22:30 BRT = 13/11 01:30 UTC: no horário de Brasília ainda é dia 12
    await mk(a.id, 7, '2026-11-13T01:30:00Z')
    // 17/11 (terça), semana seguinte
    await mk(b.id, 20, '2026-11-17T15:00:00Z')
    // outubro
    await mk(a.id, 100, '2026-10-20T15:00:00Z')
    // não conta: cancelada
    await mk(a.id, 999, '2026-11-11T15:00:00Z', DonationStatus.CANCELADA)

    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await prisma.$disconnect()
  })

  it('por dia: preenche os dias sem coleta com zero e usa o dia de Brasília', async () => {
    const res = await get('/reports/series?from=2026-11-09&to=2026-11-15&granularity=day')
    expect(res.status).toBe(200)
    const data = (await res.json()).data
    expect(data.points.map((p: { start: string }) => p.start)).toEqual(['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15'])
    const kg = Object.fromEntries(data.points.map((p: { start: string; totalKg: number }) => [p.start, p.totalKg]))
    expect(kg['2026-11-10']).toBe(15)
    expect(kg['2026-11-11']).toBe(0) // a cancelada não entra
    expect(kg['2026-11-12']).toBe(7) // coleta às 22:30 de Brasília (01:30 UTC do dia 13) fica no dia 12
    expect(kg['2026-11-13']).toBe(0)
    expect(data.totalKg).toBe(22)
    expect(data.donationCount).toBe(3)
    expect(data.points.find((p: { start: string }) => p.start === '2026-11-10').donationCount).toBe(2)
  })

  it('por semana (segunda a domingo)', async () => {
    const data = (await (await get('/reports/series?from=2026-11-09&to=2026-11-22&granularity=week')).json()).data
    expect(data.points).toEqual([
      { start: '2026-11-09', totalKg: 22, donationCount: 3 },
      { start: '2026-11-16', totalKg: 20, donationCount: 1 },
    ])
  })

  it('por mês, no ano inteiro, com meses vazios em zero', async () => {
    const data = (await (await get('/reports/series?from=2026-01-01&to=2026-12-31&granularity=month')).json()).data
    expect(data.points).toHaveLength(12)
    const kg = Object.fromEntries(data.points.map((p: { start: string; totalKg: number }) => [p.start.slice(0, 7), p.totalKg]))
    expect(kg['2026-10']).toBe(100)
    expect(kg['2026-11']).toBe(42)
    expect(kg['2026-03']).toBe(0)
    expect(data.totalKg).toBe(142)
  })

  it('filtra por doador', async () => {
    const data = (await (await get(`/reports/series?from=2026-11-01&to=2026-11-30&granularity=month&donorId=${ids.a}`)).json()).data
    expect(data.totalKg).toBe(17)
  })

  it('período sem nada devolve zeros, não erro', async () => {
    const data = (await (await get('/reports/series?from=2025-01-01&to=2025-01-07&granularity=day')).json()).data
    expect(data.totalKg).toBe(0)
    expect(data.points).toHaveLength(7)
  })

  it('valida: datas obrigatórias e válidas, ordem correta, limite de pontos', async () => {
    expect((await get('/reports/series')).status).toBe(422)
    expect((await get('/reports/series?from=ontem&to=hoje')).status).toBe(422)
    expect((await get('/reports/series?from=2026-12-01&to=2026-11-01')).status).toBe(422)
    const big = await get('/reports/series?from=2020-01-01&to=2026-12-31&granularity=day')
    expect(big.status).toBe(422)
    expect((await big.json()).message).toMatch(/grande demais/)
  })

  it('só a administração acessa', async () => {
    expect((await get('/reports/series?from=2026-11-01&to=2026-11-30', 'doador')).status).toBe(403)
    expect((await get('/reports/series?from=2026-11-01&to=2026-11-30', null)).status).toBe(401)
  })

  it('por doador e por receptor respeitam o período (por data de coleta)', async () => {
    const week = (await (await get('/reports/by-donor?from=2026-11-09&to=2026-11-15')).json()).data
    expect(week.map((r: { donorName: string; totalKg: number }) => [r.donorName, r.totalKg])).toEqual([['Padaria A', 17], ['Mercado B', 5]])
    const rec = (await (await get('/reports/by-recipient?from=2026-11-16&to=2026-11-22')).json()).data
    expect(rec.map((r: { recipientName: string; totalKg: number }) => [r.recipientName, r.totalKg])).toEqual([['ONG Mesa', 20]])
    // sem período, continua valendo o filtro por ano
    const year = (await (await get('/reports/by-donor?year=2026')).json()).data
    expect(year.reduce((s: number, r: { totalKg: number }) => s + r.totalKg, 0)).toBe(142)
  })
})
