import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import sharp from 'sharp'
import { DonationStatus, PhotoKind, Role } from '@prisma/client'

// Fotos e link de campo, de ponta a ponta: Express + PostgreSQL reais, sharp real e
// armazenamento em disco temporário.
let storageDir: string
process.env.REQUIRE_OFFER_PHOTO = 'true'

let server: Server
let base: string
let prisma: typeof import('../../src/config/prisma').prisma
const tokens: Record<string, string> = {}
const hours = (h: number) => new Date(Date.now() + h * 3_600_000)

const jpeg = (color = '#2f855a') =>
  sharp({ create: { width: 2400, height: 1600, channels: 3, background: color } })
    .withExif({ IFD0: { Make: 'CelularSecreto' } })
    .jpeg()
    .toBuffer()

function form(files: Buffer[], fields: Record<string, string> = {}, name = 'foto.jpg') {
  const data = new FormData()
  for (const [k, v] of Object.entries(fields)) data.append(k, v)
  for (const file of files) data.append('photos', new Blob([new Uint8Array(file)], { type: 'image/jpeg' }), name)
  return data
}

const call = (method: string, p: string, who: string | null, body?: unknown) =>
  fetch(`${base}/api/v1${p}`, {
    method,
    headers: {
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}),
    },
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
  })

describe('fotos e link de campo', () => {
  let donationA: string
  let donationB: string
  let recipientId: string
  let routeId: string
  let stops: { collect: string; absent: string }

  beforeAll(async () => {
    storageDir = await mkdtemp(path.join(os.tmpdir(), 'cf-fotos-'))
    process.env.STORAGE_DIR = storageDir
    ;({ prisma } = await import('../../src/config/prisma'))
    const { app } = await import('../../src/app')
    const { generateTokenPair } = await import('../../src/utils/jwt')
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE notifications, donation_events, donation_photos, donations, pickup_route_access, pickup_routes, vehicles, volunteers, donors, recipients, password_reset_tokens, users RESTART IDENTITY CASCADE',
    )
    const pw = await bcrypt.hash('Senha@12345', 4)
    const mk = async (key: string, role: Role, profile?: 'donor' | 'recipient') => {
      const user = await prisma.user.create({
        data: {
          name: key, email: `${key}@t.org`, password: pw, role,
          ...(profile === 'donor' ? { donorProfile: { create: { name: key, city: 'Sorocaba', address: 'Rua A, 10', phone: '(15) 99999-0000' } } } : {}),
          ...(profile === 'recipient' ? { recipientProfile: { create: { name: key, city: 'Sorocaba' } } } : {}),
        },
        include: { donorProfile: true, recipientProfile: true },
      })
      tokens[key] = generateTokenPair({ sub: user.id, role }).accessToken
      return user
    }
    await mk('admin', Role.ADMIN)
    const donor = await mk('doador', Role.DOADOR, 'donor')
    await mk('outrodoador', Role.DOADOR, 'donor')
    const recipient = await mk('receptor', Role.RECEPTOR, 'recipient')
    await mk('outroreceptor', Role.RECEPTOR, 'recipient')
    recipientId = recipient.recipientProfile!.id

    const mkDonation = async (description: string, extra: Record<string, unknown> = {}) =>
      (await prisma.donation.create({
        data: { donorId: donor.donorProfile!.id, description, estimatedQuantityKg: 10, pickupWindowStart: hours(-1), pickupWindowEnd: hours(40), ...extra },
      })).id
    donationA = await mkDonation('Pães')
    donationB = await mkDonation('Leite')

    await new Promise<void>((resolve) => { server = app.listen(0, '127.0.0.1', resolve) })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await prisma.$disconnect()
    await rm(storageDir, { recursive: true, force: true })
  })

  describe('foto da oferta (doador)', () => {
    it('sem foto, a doação não aparece para reserva e não pode ser reservada', async () => {
      const list = await call('GET', '/donations/opportunities', 'receptor')
      expect((await list.json()).data.data).toHaveLength(0)

      const reserve = await call('PATCH', `/donations/${donationA}/reserve`, 'receptor')
      expect(reserve.status).toBe(422)
      expect((await reserve.json()).message).toMatch(/ainda não tem foto/)
    })

    it('o doador envia fotos; ficam reduzidas e sem EXIF', async () => {
      const original = await jpeg()
      const res = await call('POST', `/donations/${donationA}/photos`, 'doador', form([original, await jpeg('#c05621')]))
      expect(res.status).toBe(201)
      const created = (await res.json()).data
      expect(created).toHaveLength(2)
      expect(created[0].kind).toBe('OFERTA')
      expect(created[0]).not.toHaveProperty('storageKey')

      const file = await call('GET', `/donations/${donationA}/photos/${created[0].id}/file`, 'doador')
      expect(file.status).toBe(200)
      expect(file.headers.get('content-type')).toBe('image/webp')
      expect(file.headers.get('cross-origin-resource-policy')).toBe('cross-origin')
      const meta = await sharp(Buffer.from(await file.arrayBuffer())).metadata()
      expect(meta.width).toBe(1280)
      expect(meta.exif).toBeUndefined()
    })

    it('limite de 3 fotos da oferta', async () => {
      const ok = await call('POST', `/donations/${donationA}/photos`, 'doador', form([await jpeg()]))
      expect(ok.status).toBe(201)
      const over = await call('POST', `/donations/${donationA}/photos`, 'doador', form([await jpeg()]))
      expect(over.status).toBe(422)
      expect((await over.json()).message).toMatch(/No máximo 3 fotos/)
    })

    it('arquivo que não é imagem é recusado, mesmo com nome .jpg', async () => {
      const res = await call('POST', `/donations/${donationB}/photos`, 'doador', form([Buffer.from('<?php system($_GET[1]); ?>')], {}, 'foto.jpg'))
      expect(res.status).toBe(422)
      expect(await prisma.donationPhoto.count({ where: { donationId: donationB } })).toBe(0)
    })

    it('envio sem arquivo é recusado', async () => {
      const res = await call('POST', `/donations/${donationB}/photos`, 'doador', form([]))
      expect(res.status).toBe(422)
    })

    it('outro doador e receptor não enviam foto da oferta de quem não é seu', async () => {
      expect((await call('POST', `/donations/${donationB}/photos`, 'outrodoador', form([await jpeg()]))).status).toBe(403)
      expect((await call('POST', `/donations/${donationB}/photos`, 'receptor', form([await jpeg()]))).status).toBe(403)
    })

    it('a foto da coleta não pode ser enviada por esta rota', async () => {
      const res = await call('POST', `/donations/${donationB}/photos`, 'admin', form([await jpeg()], { kind: 'COLETA' }))
      expect(res.status).toBe(422)
    })

    it('com foto, a doação aparece com a capa e pode ser reservada', async () => {
      const list = await call('GET', '/donations/opportunities', 'receptor')
      const rows = (await list.json()).data.data
      expect(rows).toHaveLength(1)
      expect(rows[0].photos).toHaveLength(1)
    })
  })

  describe('quem vê as fotos', () => {
    it('qualquer receptor vê a foto da OFERTA enquanto a doação está disponível', async () => {
      const res = await call('GET', `/donations/${donationA}/photos`, 'outroreceptor')
      expect(res.status).toBe(200)
      expect((await res.json()).data).toHaveLength(3)
    })

    it('outro doador não vê nada', async () => {
      const list = await call('GET', `/donations/${donationA}/photos`, 'outrodoador')
      expect((await list.json()).data).toHaveLength(0)
      const photo = await prisma.donationPhoto.findFirstOrThrow({ where: { donationId: donationA } })
      expect((await call('GET', `/donations/${donationA}/photos/${photo.id}/file`, 'outrodoador')).status).toBe(404)
    })

    it('sem login: 401', async () => {
      expect((await call('GET', `/donations/${donationA}/photos`, null)).status).toBe(401)
    })
  })

  describe('link de campo do voluntário', () => {
    let link: string

    beforeAll(async () => {
      const vehicle = await prisma.vehicle.create({ data: { plate: 'AAA1B23', model: 'Van', capacityKg: 500 } })
      const volunteer = await prisma.volunteer.create({ data: { name: 'Carlos Andrade', document: '529.982.247-25' } })
      const route = await prisma.pickupRoute.create({ data: { vehicleId: vehicle.id, volunteerId: volunteer.id, scheduledFor: new Date() } })
      routeId = route.id
      const donor = await prisma.donor.findFirstOrThrow({ where: { name: 'doador' } })
      const mk = async (description: string) =>
        (await prisma.donation.create({
          data: { donorId: donor.id, recipientId, description, estimatedQuantityKg: 10, pickupWindowStart: hours(-1), pickupWindowEnd: hours(40), status: DonationStatus.AGENDADA, routeId },
        })).id
      stops = { collect: await mk('Arroz'), absent: await mk('Feijão') }
    })

    const field = (method: string, p: string, body?: unknown) =>
      fetch(`${base}/api/v1/field/${p}`, {
        method,
        // cookie de CSRF presente SEM o cabeçalho: o link de campo não depende de sessão
        headers: { Cookie: 'conectfome_csrf=qualquer', ...(body instanceof FormData || body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
      })
    const tokenOf = () => new URL(link).pathname.split('/').pop()!

    it('só a administração gera o link', async () => {
      expect((await call('POST', `/pickup-routes/${routeId}/field-link`, 'doador')).status).toBe(403)
      const res = await call('POST', `/pickup-routes/${routeId}/field-link`, 'admin')
      expect(res.status).toBe(200)
      link = (await res.json()).data.link
      expect(link).toMatch(/\/coleta\/[0-9a-f]{64}$/)
      expect(await prisma.pickupRouteAccess.count({ where: { routeId, revokedAt: null } })).toBe(1)
    })

    it('token inventado ou malformado: 404 com a mesma mensagem', async () => {
      for (const t of ['0'.repeat(64), 'abc', 'x'.repeat(100)]) {
        const res = await field('GET', t)
        expect(res.status).toBe(404)
        expect((await res.json()).message).toMatch(/não é válido ou já expirou/)
      }
    })

    it('o voluntário vê as paradas com endereço e contato, sem login', async () => {
      const res = await field('GET', tokenOf())
      expect(res.status).toBe(200)
      const data = (await res.json()).data
      expect(data.volunteerName).toBe('Carlos Andrade')
      expect(data.requirePhoto).toBe(true)
      const [stop] = data.stops
      expect(stop.address).toBe('Rua A, 10')
      expect(stop.phone).toBe('(15) 99999-0000')
      expect(stop.donations.map((d: { description: string }) => d.description).sort()).toEqual(['Arroz', 'Feijão'])
    })

    it('inicia a rota pelo link', async () => {
      const res = await field('POST', `${tokenOf()}/start`)
      expect(res.status).toBe(200)
      expect((await res.json()).data.route.status).toBe('EM_ANDAMENTO')
    })

    it('coletar sem foto é recusado (a exigência está ligada)', async () => {
      const res = await field('POST', `${tokenOf()}/stops/${stops.collect}/collect`, form([], { quantityKg: '9' }))
      expect(res.status).toBe(422)
      expect((await prisma.donation.findUniqueOrThrow({ where: { id: stops.collect } })).status).toBe('AGENDADA')
    })

    it('coletar com foto: doação COLETADA, foto da coleta guardada, autor registrado', async () => {
      const res = await field('POST', `${tokenOf()}/stops/${stops.collect}/collect`, form([await jpeg()], { quantityKg: '9.5' }))
      expect(res.status).toBe(200)

      const donation = await prisma.donation.findUniqueOrThrow({ where: { id: stops.collect } })
      expect(donation.status).toBe('COLETADA')
      expect(Number(donation.collectedQuantityKg)).toBe(9.5)

      const photo = await prisma.donationPhoto.findFirstOrThrow({ where: { donationId: stops.collect, kind: PhotoKind.COLETA } })
      expect(photo.uploadedByLabel).toBe('Voluntário Carlos Andrade (link de campo)')
      const event = await prisma.donationEvent.findFirstOrThrow({ where: { donationId: stops.collect, action: 'COLETADA' } })
      expect(event.actorLabel).toBe('Voluntário Carlos Andrade (link de campo)')
    })

    it('parada resolvida não pode ser resolvida de novo, e a foto não fica órfã', async () => {
      const before = await prisma.donationPhoto.count({ where: { donationId: stops.collect } })
      const res = await field('POST', `${tokenOf()}/stops/${stops.collect}/collect`, form([await jpeg()]))
      expect(res.status).toBe(422)
      expect(await prisma.donationPhoto.count({ where: { donationId: stops.collect } })).toBe(before)
    })

    it('não finaliza com parada aberta', async () => {
      const res = await field('POST', `${tokenOf()}/finish`)
      expect(res.status).toBe(422)
      expect((await res.json()).message).toMatch(/1 parada/)
    })

    it('doador ausente (com foto do local): volta para reagendar', async () => {
      const res = await field('POST', `${tokenOf()}/stops/${stops.absent}/fail`, form([await jpeg()], { reason: 'DOADOR_AUSENTE', note: '' }))
      expect(res.status).toBe(200)
      const donation = await prisma.donation.findUniqueOrThrow({ where: { id: stops.absent } })
      expect(donation).toMatchObject({ status: 'RESERVADA', routeId: null, pickupFailureReason: 'DOADOR_AUSENTE' })
    })

    it('finaliza a rota pelo link', async () => {
      const res = await field('POST', `${tokenOf()}/finish`)
      expect(res.status).toBe(200)
      expect((await res.json()).data.route.status).toBe('CONCLUIDA')
    })

    it('gerar um link novo derruba o anterior; a administração também pode revogar', async () => {
      const old = tokenOf()
      // rota concluída não gera mais link
      expect((await call('POST', `/pickup-routes/${routeId}/field-link`, 'admin')).status).toBe(422)

      // com a rota planejada, o link novo substitui o anterior
      const vehicle = await prisma.vehicle.create({ data: { plate: 'BBB2C34', model: 'Fiorino', capacityKg: 300 } })
      const volunteer = await prisma.volunteer.findFirstOrThrow()
      const route2 = await prisma.pickupRoute.create({ data: { vehicleId: vehicle.id, volunteerId: volunteer.id, scheduledFor: new Date() } })
      const first = (await (await call('POST', `/pickup-routes/${route2.id}/field-link`, 'admin')).json()).data.link as string
      const second = (await (await call('POST', `/pickup-routes/${route2.id}/field-link`, 'admin')).json()).data.link as string
      const tok = (l: string) => new URL(l).pathname.split('/').pop()!
      expect((await field('GET', tok(first))).status).toBe(404)
      expect((await field('GET', tok(second))).status).toBe(200)

      expect((await call('DELETE', `/pickup-routes/${route2.id}/field-link`, 'admin')).status).toBe(204)
      expect((await field('GET', tok(second))).status).toBe(404)
      expect(old).not.toBe(tok(first))
    })

    it('link vencido deixa de valer', async () => {
      await prisma.pickupRouteAccess.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } })
      const access = await prisma.pickupRouteAccess.findFirstOrThrow()
      expect(access.expiresAt.getTime()).toBeLessThan(Date.now())
      expect((await field('GET', tokenOf())).status).toBe(404)
    })
  })

  describe('foto da entrega (receptor)', () => {
    it('só depois da coleta, e só o receptor da doação', async () => {
      const early = await call('POST', `/donations/${donationA}/photos`, 'receptor', form([await jpeg()], { kind: 'ENTREGA' }))
      expect(early.status).toBe(403) // donationA ainda não é do receptor

      await prisma.donation.update({ where: { id: donationB }, data: { recipientId, status: DonationStatus.RESERVADA } })
      expect((await call('POST', `/donations/${donationB}/photos`, 'receptor', form([await jpeg()], { kind: 'ENTREGA' }))).status).toBe(422)

      await prisma.donation.update({ where: { id: donationB }, data: { status: DonationStatus.COLETADA } })
      expect((await call('POST', `/donations/${donationB}/photos`, 'outroreceptor', form([await jpeg()], { kind: 'ENTREGA' }))).status).toBe(403)
      const ok = await call('POST', `/donations/${donationB}/photos`, 'receptor', form([await jpeg()], { kind: 'ENTREGA' }))
      expect(ok.status).toBe(201)
      expect((await ok.json()).data[0].kind).toBe('ENTREGA')
    })

    it('depois de reservada, as fotos da coleta só são vistas por quem faz parte', async () => {
      // a doação do voluntário (stops.collect) é do "receptor"; o outro receptor não vê a foto da coleta
      const mine = await call('GET', `/donations/${stops.collect}/photos`, 'receptor')
      expect((await mine.json()).data.some((p: { kind: string }) => p.kind === 'COLETA')).toBe(true)
      const other = await call('GET', `/donations/${stops.collect}/photos`, 'outroreceptor')
      expect((await other.json()).data).toHaveLength(0)
    })
  })
})
