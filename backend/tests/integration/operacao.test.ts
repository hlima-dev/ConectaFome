import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import bcrypt from 'bcryptjs'
import { DonationStatus, Role } from '@prisma/client'

// Operação, de ponta a ponta (Express + PostgreSQL reais): coleta parada a parada,
// motivos de falha e recuperação de senha por link gerado pela administração.
let server: Server
let base: string
let prisma: typeof import('../../src/config/prisma').prisma
const tokens: Record<string, string> = {}
const hours = (h: number) => new Date(Date.now() + h * 3_600_000)

const call = (method: string, path: string, who: string | null, body?: unknown) =>
  fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

describe('operação: paradas da rota e senha', () => {
  let routeId: string
  let ids: { collect: string; absent: string; improper: string }
  let donorUserId: string

  beforeAll(async () => {
    ;({ prisma } = await import('../../src/config/prisma'))
    const { app } = await import('../../src/app')
    const { generateTokenPair } = await import('../../src/utils/jwt')
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE notifications, donation_events, donations, pickup_routes, vehicles, volunteers, donors, recipients, password_reset_tokens, users RESTART IDENTITY CASCADE',
    )
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin@t.org', password: await bcrypt.hash('Senha@12345', 4), role: Role.ADMIN } })
    tokens.admin = generateTokenPair({ sub: admin.id, role: Role.ADMIN }).accessToken

    const donor = await prisma.donor.create({
      data: { name: 'Mercado', city: 'Sorocaba', user: { create: { name: 'Dono', email: 'dono@t.org', password: await bcrypt.hash('Senha@12345', 4), role: Role.DOADOR } } },
    })
    donorUserId = donor.userId!
    const recipient = await prisma.recipient.create({ data: { name: 'ONG', city: 'Sorocaba' } })
    const vehicle = await prisma.vehicle.create({ data: { plate: 'AAA1B23', model: 'Van', capacityKg: 500 } })
    const volunteer = await prisma.volunteer.create({ data: { name: 'Carlos', document: '529.982.247-25' } })
    const route = await prisma.pickupRoute.create({ data: { vehicleId: vehicle.id, volunteerId: volunteer.id, scheduledFor: new Date() } })
    routeId = route.id

    const mk = async (description: string) =>
      (
        await prisma.donation.create({
          data: {
            donorId: donor.id, recipientId: recipient.id, description, estimatedQuantityKg: 10,
            pickupWindowStart: hours(-1), pickupWindowEnd: hours(40), status: DonationStatus.AGENDADA, routeId,
          },
        })
      ).id
    ids = { collect: await mk('Coletar'), absent: await mk('Doador ausente'), improper: await mk('Impróprio') }

    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await prisma.$disconnect()
  })

  it('não registra parada com a rota ainda planejada', async () => {
    const res = await call('PATCH', `/pickup-routes/${routeId}/stops/${ids.collect}/collect`, 'admin', {})
    expect(res.status).toBe(422)
  })

  it('coleta uma parada, falha outra (reagendar) e cancela a terceira (impróprio)', async () => {
    expect((await call('PATCH', `/pickup-routes/${routeId}/start`, 'admin')).status).toBe(200)

    const collect = await call('PATCH', `/pickup-routes/${routeId}/stops/${ids.collect}/collect`, 'admin', { quantityKg: 9.5 })
    expect(collect.status).toBe(200)

    const absent = await call('PATCH', `/pickup-routes/${routeId}/stops/${ids.absent}/fail`, 'admin', { reason: 'DOADOR_AUSENTE' })
    expect(absent.status).toBe(200)

    const improper = await call('PATCH', `/pickup-routes/${routeId}/stops/${ids.improper}/fail`, 'admin', { reason: 'PRODUTO_IMPROPRIO', note: 'cheiro forte' })
    expect(improper.status).toBe(200)

    const d = async (id: string) => prisma.donation.findUniqueOrThrow({ where: { id } })
    const collected = await d(ids.collect)
    expect(collected.status).toBe('COLETADA')
    expect(Number(collected.collectedQuantityKg)).toBe(9.5)

    const absentRow = await d(ids.absent)
    expect(absentRow).toMatchObject({ status: 'RESERVADA', routeId: null, pickupFailureReason: 'DOADOR_AUSENTE', failedRouteId: routeId })
    expect(absentRow.recipientId).not.toBeNull() // continua reservada para o mesmo receptor

    const improperRow = await d(ids.improper)
    expect(improperRow).toMatchObject({ status: 'CANCELADA', pickupFailureReason: 'PRODUTO_IMPROPRIO' })

    const ev = await prisma.donationEvent.findFirstOrThrow({ where: { donationId: ids.improper, action: 'COLETA_FALHOU' } })
    expect(ev.detail).toBe('Produto impróprio para consumo (cheiro forte)')
  })

  it('a parada não pode ser resolvida duas vezes', async () => {
    const again = await call('PATCH', `/pickup-routes/${routeId}/stops/${ids.collect}/collect`, 'admin', {})
    expect(again.status).toBe(422)
  })

  it('o detalhe da rota mostra as paradas que falharam', async () => {
    const res = await call('GET', `/pickup-routes/${routeId}`, 'admin')
    const route = (await res.json()).data
    expect(route.failedDonations.map((f: { description: string }) => f.description).sort()).toEqual(['Doador ausente', 'Impróprio'])
  })

  it('concluir a rota não repete a coleta e conta só o que foi coletado', async () => {
    const res = await call('PATCH', `/pickup-routes/${routeId}/complete`, 'admin', {})
    expect(res.status).toBe(200)
    const events = await prisma.donationEvent.count({ where: { donationId: ids.collect, action: 'COLETADA' } })
    expect(events).toBe(1)
  })

  it('o doador foi avisado da coleta que falhou', async () => {
    const note = await prisma.notification.findFirst({ where: { userId: donorUserId, message: { contains: 'não foi realizada' } } })
    expect(note).not.toBeNull()
  })

  describe('senha', () => {
    it('a administração gera o link, a pessoa define a senha nova e o link só vale uma vez', async () => {
      const gen = await call('POST', `/auth/users/${donorUserId}/reset-link`, 'admin')
      expect(gen.status).toBe(200)
      const link = (await gen.json()).data.link as string
      const token = new URL(link).searchParams.get('token')!

      const weak = await call('POST', '/auth/reset-password', null, { token, password: 'fraca' })
      expect(weak.status).toBe(422)

      const ok = await call('POST', '/auth/reset-password', null, { token, password: 'NovaSenha@123' })
      expect(ok.status).toBe(200)

      const login = await call('POST', '/auth/login', null, { email: 'dono@t.org', password: 'NovaSenha@123' })
      expect(login.status).toBe(200)
      const old = await call('POST', '/auth/login', null, { email: 'dono@t.org', password: 'Senha@12345' })
      expect(old.status).toBe(401)

      const reuse = await call('POST', '/auth/reset-password', null, { token, password: 'OutraSenha@123' })
      expect(reuse.status).toBe(422)
    })

    it('"esqueci minha senha" responde igual para e-mail existente e inexistente', async () => {
      const a = await call('POST', '/auth/forgot-password', null, { email: 'dono@t.org' })
      const b = await call('POST', '/auth/forgot-password', null, { email: 'ninguem@t.org' })
      expect(a.status).toBe(200)
      expect(b.status).toBe(200)
      expect((await a.json()).message).toBe((await b.json()).message)
    })

    it('só administrador gera link', async () => {
      const res = await call('POST', `/auth/users/${donorUserId}/reset-link`, null)
      expect(res.status).toBe(401)
    })
  })
})
