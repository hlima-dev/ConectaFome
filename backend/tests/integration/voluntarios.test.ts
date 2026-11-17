import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import bcrypt from 'bcryptjs'
import { Role } from '@prisma/client'

// Inscrição pública de voluntários e análise pela administração, com PostgreSQL real.
process.env.APPLY_RATE_LIMIT_MAX = '500' // o limite em si é testado em voluntariosLimite.test.ts

let server: Server
let base: string
let prisma: typeof import('../../src/config/prisma').prisma
const tokens: Record<string, string> = {}

const call = (method: string, path: string, who: string | null, body?: unknown, headers: Record<string, string> = {}) =>
  fetch(`${base}/api/v1${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const form = (over: Record<string, unknown> = {}) => ({
  name: 'Carlos Andrade', phone: '(15) 99999-1111', email: 'carlos@email.com', city: 'Sorocaba',
  availability: ['FIM_DE_SEMANA'], hasVehicle: true, message: 'Tenho uma Fiorino', consent: true, ...over,
})
const apply = (body: unknown, headers: Record<string, string> = {}) => call('POST', '/public/volunteers/apply', null, body, headers)

describe('inscrição de voluntários', () => {
  let appId: string

  beforeAll(async () => {
    ;({ prisma } = await import('../../src/config/prisma'))
    const { app } = await import('../../src/app')
    const { generateTokenPair } = await import('../../src/utils/jwt')
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE notifications, donation_events, donation_photos, donations, pickup_route_access, pickup_routes, vehicles, volunteer_applications, volunteers, donors, recipients, password_reset_tokens, users RESTART IDENTITY CASCADE',
    )
    const pw = await bcrypt.hash('Senha@12345', 4)
    const admin = await prisma.user.create({ data: { name: 'Admin', email: 'admin@t.org', password: pw, role: Role.ADMIN } })
    const donor = await prisma.user.create({ data: { name: 'Dono', email: 'dono@t.org', password: pw, role: Role.DOADOR } })
    tokens.admin = generateTokenPair({ sub: admin.id, role: Role.ADMIN }).accessToken
    tokens.doador = generateTokenPair({ sub: donor.id, role: Role.DOADOR }).accessToken
    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await prisma.$disconnect()
  })

  describe('formulário público', () => {
    it('qualquer pessoa se inscreve, sem login, mesmo com um cookie CSRF antigo no navegador', async () => {
      const res = await apply(form(), { Cookie: 'conectfome_csrf=cookie-antigo' })
      expect(res.status).toBe(201)
      const row = await prisma.volunteerApplication.findFirstOrThrow()
      expect(row).toMatchObject({ name: 'Carlos Andrade', phone: '15999991111', email: 'carlos@email.com', city: 'Sorocaba', status: 'PENDENTE', hasVehicle: true })
      expect(row.availability).toEqual(['FIM_DE_SEMANA'])
      expect(row.consentAt).toBeInstanceOf(Date)
      expect(row.volunteerId).toBeNull()
    })

    it('a administração é avisada, com o caminho da lista', async () => {
      await vi.waitFor(async () => {
        const note = await prisma.notification.findFirst({ where: { message: { contains: 'Nova inscrição de voluntário' } } })
        expect(note?.link).toBe('/voluntarios?aba=inscricoes')
      }, { timeout: 3000, interval: 50 })
    })

    it('não duplica uma inscrição pendente com o mesmo telefone', async () => {
      const res = await apply(form({ name: 'Outro nome' }))
      expect(res.status).toBe(409)
      expect(await prisma.volunteerApplication.count()).toBe(1)
    })

    it('valida os campos (nome, telefone com DDD, horário, aceite)', async () => {
      for (const bad of [
        form({ name: 'A' }), form({ phone: '123' }), form({ phone: undefined }), form({ city: '' }),
        form({ availability: [] }), form({ availability: ['QUALQUER'] }), form({ consent: false }), form({ consent: undefined }), form({ email: 'nao-e-email' }),
      ]) {
        const res = await apply(bad)
        expect(res.status, JSON.stringify(bad)).toBe(422)
      }
      expect(await prisma.volunteerApplication.count()).toBe(1)
    })

    it('não pede nem aceita CPF no formulário público', async () => {
      const res = await apply(form({ phone: '(15) 98888-2222', document: '529.982.247-25' }))
      expect(res.status).toBe(201)
      const row = await prisma.volunteerApplication.findFirstOrThrow({ where: { phone: '15988882222' } })
      expect(JSON.stringify(row)).not.toContain('529.982.247-25')
    })

    it('robô que preenche o campo-isca recebe sucesso, mas nada é gravado', async () => {
      const before = await prisma.volunteerApplication.count()
      const res = await apply(form({ phone: '(15) 97777-3333', website: 'http://spam.example' }))
      expect(res.status).toBe(201)
      expect(await prisma.volunteerApplication.count()).toBe(before)
    })
  })

  describe('análise pela administração', () => {
    it('só a administração vê a lista', async () => {
      expect((await call('GET', '/volunteer-applications', null)).status).toBe(401)
      expect((await call('GET', '/volunteer-applications', 'doador')).status).toBe(403)
      const res = await call('GET', '/volunteer-applications?status=PENDENTE', 'admin')
      expect(res.status).toBe(200)
      const rows = (await res.json()).data.data
      expect(rows.map((r: { name: string }) => r.name)).toEqual(['Carlos Andrade', 'Carlos Andrade']) // mais antigas primeiro
      appId = rows[0].id
    })

    it('a central de pendências conta as inscrições', async () => {
      const pending = (await (await call('GET', '/reports/pending', 'admin')).json()).data
      expect(pending.volunteerApplications.count).toBe(2)
      expect(pending.volunteerApplications.items[0]).toMatchObject({ name: 'Carlos Andrade', city: 'Sorocaba' })
      expect(pending.total).toBeGreaterThanOrEqual(2)
    })

    it('aprovar exige um CPF válido e doador/receptor não aprovam', async () => {
      expect((await call('PATCH', `/volunteer-applications/${appId}/approve`, 'doador', { document: '529.982.247-25' })).status).toBe(403)
      expect((await call('PATCH', `/volunteer-applications/${appId}/approve`, 'admin', {})).status).toBe(422)
      expect((await call('PATCH', `/volunteer-applications/${appId}/approve`, 'admin', { document: '111.111.111-11' })).status).toBe(422)
      expect(await prisma.volunteer.count()).toBe(0)
    })

    it('aprovar cria o voluntário, que já pode ser usado em uma rota', async () => {
      const res = await call('PATCH', `/volunteer-applications/${appId}/approve`, 'admin', { document: '52998224725' })
      expect(res.status).toBe(200)
      const volunteer = (await res.json()).data
      expect(volunteer).toMatchObject({ name: 'Carlos Andrade', document: '529.982.247-25', phone: '15999991111', active: true })

      const app = await prisma.volunteerApplication.findUniqueOrThrow({ where: { id: appId } })
      expect(app).toMatchObject({ status: 'APROVADA', volunteerId: volunteer.id })
      expect(app.reviewedAt).toBeInstanceOf(Date)

      const vehicle = await prisma.vehicle.create({ data: { plate: 'AAA1B23', model: 'Van', capacityKg: 500 } })
      const route = await call('POST', '/pickup-routes', 'admin', { vehicleId: vehicle.id, volunteerId: volunteer.id, scheduledFor: new Date().toISOString() })
      expect(route.status).toBe(201)
    })

    it('a mesma inscrição não é analisada duas vezes', async () => {
      expect((await call('PATCH', `/volunteer-applications/${appId}/approve`, 'admin', { document: '52998224725' })).status).toBe(422)
      expect((await call('PATCH', `/volunteer-applications/${appId}/reject`, 'admin', {})).status).toBe(422)
    })

    it('CPF de voluntário que já existe: conflito, e a inscrição continua pendente', async () => {
      const other = await prisma.volunteerApplication.findFirstOrThrow({ where: { status: 'PENDENTE' } })
      const res = await call('PATCH', `/volunteer-applications/${other.id}/approve`, 'admin', { document: '52998224725' })
      expect(res.status).toBe(409)
      expect((await prisma.volunteerApplication.findUniqueOrThrow({ where: { id: other.id } })).status).toBe('PENDENTE')
    })

    it('recusar guarda o motivo e tira a inscrição da fila de pendências', async () => {
      const other = await prisma.volunteerApplication.findFirstOrThrow({ where: { status: 'PENDENTE' } })
      const res = await call('PATCH', `/volunteer-applications/${other.id}/reject`, 'admin', { note: 'fora da região' })
      expect(res.status).toBe(200)
      expect(await prisma.volunteerApplication.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ status: 'RECUSADA', reviewNote: 'fora da região' })
      const pending = (await (await call('GET', '/reports/pending', 'admin')).json()).data
      expect(pending.volunteerApplications.count).toBe(0)
      const all = (await (await call('GET', '/volunteer-applications', 'admin')).json()).data.data
      expect(all.map((r: { status: string }) => r.status).sort()).toEqual(['APROVADA', 'RECUSADA'])
    })
  })
})
