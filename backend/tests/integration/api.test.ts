import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import bcrypt from 'bcryptjs'
import { Role } from '@prisma/client'
import { app } from '../../src/app'
import { prisma } from '../../src/config/prisma'
import { generateTokenPair } from '../../src/utils/jwt'

// Testa a API pela rede, com o Express e o PostgreSQL de verdade: autenticação,
// CSRF e a matriz de permissões por papel descrita na documentação (Seção 8.5).
let server: Server
let base: string
const tokens: Record<string, string> = {}
let donationId: string

const call = (method: string, path: string, who: string | null, body?: unknown) =>
  fetch(`${base}/api/v1${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(who ? { Authorization: `Bearer ${tokens[who]}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })

const donationBody = (over: Record<string, unknown> = {}) => ({
  description: 'Pães do dia',
  estimatedQuantityKg: 5,
  category: 'PADARIA',
  acceptTerms: true,
  pickupWindowStart: new Date().toISOString(),
  pickupWindowEnd: new Date(Date.now() + 10 * 3_600_000).toISOString(),
  ...over,
})

async function makeUser(key: string, role: Role, profile?: 'donor' | 'recipient') {
  const user = await prisma.user.create({
    data: {
      name: key, email: `${key}@t.org`, password: await bcrypt.hash('Senha@12345', 4), role,
      ...(profile === 'donor' ? { donorProfile: { create: { name: key, city: 'Sorocaba' } } } : {}),
      ...(profile === 'recipient' ? { recipientProfile: { create: { name: key, city: 'Sorocaba' } } } : {}),
    },
  })
  tokens[key] = generateTokenPair({ sub: user.id, role }).accessToken
}

describe('API HTTP (Express + PostgreSQL reais)', () => {
  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE notifications, donation_events, donations, pickup_routes, vehicles, volunteers, donors, recipients, users RESTART IDENTITY CASCADE',
    )
    await makeUser('admin', Role.ADMIN)
    await makeUser('doador', Role.DOADOR, 'donor')
    await makeUser('outrodoador', Role.DOADOR, 'donor')
    await makeUser('receptor', Role.RECEPTOR, 'recipient')
    await makeUser('outroreceptor', Role.RECEPTOR, 'recipient')
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', resolve)
    })
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()))
    await prisma.$disconnect()
  })

  describe('autenticação', () => {
    it('sem credenciais: 401', async () => {
      expect((await call('GET', '/donations', null)).status).toBe(401)
    })
    it('token inválido: 401', async () => {
      const res = await fetch(`${base}/api/v1/donations`, { headers: { Authorization: 'Bearer lixo' } })
      expect(res.status).toBe(401)
    })
    it('rota inexistente: 404 em JSON', async () => {
      const res = await fetch(`${base}/api/v1/nao-existe`)
      expect(res.status).toBe(404)
      expect((await res.json()).status).toBe('error')
    })
    it('o cadastro público nunca cria administrador', async () => {
      const res = await fetch(`${base}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Mal', email: 'mal@t.org', password: 'Senha@12345', role: 'ADMIN' }),
      })
      expect(res.status).toBe(422)
      expect(await prisma.user.count({ where: { email: 'mal@t.org' } })).toBe(0)
    })
  })

  describe('login com cookies e CSRF', () => {
    it('login funciona mesmo com um cookie CSRF antigo no navegador (sessão que expirou)', async () => {
      const res = await fetch(`${base}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: 'conectfome_csrf=cookie-antigo-de-outra-sessao' },
        body: JSON.stringify({ email: 'doador@t.org', password: 'Senha@12345' }),
      })
      expect(res.status).toBe(200)
      expect(res.headers.get('set-cookie')).toContain('conectfome_csrf=')
    })

    it('login entrega cookies httpOnly e, numa escrita, exige o cabeçalho CSRF que bate com o cookie', async () => {
      const login = await fetch(`${base}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'doador@t.org', password: 'Senha@12345' }),
      })
      expect(login.status).toBe(200)
      const setCookies = login.headers.getSetCookie()
      expect(setCookies.length).toBeGreaterThanOrEqual(2)
      expect(setCookies.every((c) => /HttpOnly/i.test(c))).toBe(true)
      const csrfToken = (await login.json()).data.csrfToken as string
      expect(csrfToken).toBeTruthy()
      const cookie = setCookies.map((c) => c.split(';')[0]).join('; ')

      // escrita com cookie mas SEM o cabeçalho CSRF: bloqueada
      const noHeader = await fetch(`${base}/api/v1/donations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify(donationBody()),
      })
      expect(noHeader.status).toBe(403)

      // com cabeçalho errado: bloqueada
      const wrong = await fetch(`${base}/api/v1/donations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': 'errado' }, body: JSON.stringify(donationBody()),
      })
      expect(wrong.status).toBe(403)

      // com o cabeçalho certo: passa
      const ok = await fetch(`${base}/api/v1/donations`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': csrfToken }, body: JSON.stringify(donationBody({ description: 'via cookie' })),
      })
      expect(ok.status).toBe(201)
    })

    it('senha errada: 401 com mensagem genérica (não revela se o e-mail existe)', async () => {
      const wrongPass = await fetch(`${base}/api/v1/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'doador@t.org', password: 'errada' }),
      })
      const unknown = await fetch(`${base}/api/v1/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'ninguem@t.org', password: 'errada' }),
      })
      expect(wrongPass.status).toBe(401)
      expect(unknown.status).toBe(401)
      expect((await wrongPass.json()).message).toBe((await unknown.json()).message)
    })
  })

  describe('doações: quem pode o quê', () => {
    it('receptor não cria doação; administrador precisa informar o doador', async () => {
      expect((await call('POST', '/donations', 'receptor', donationBody())).status).toBe(403)
      expect((await call('POST', '/donations', 'admin', donationBody())).status).toBe(422)
    })

    it('sem a declaração de aptidão: 422; perecível sem armazenamento: 422', async () => {
      expect((await call('POST', '/donations', 'doador', donationBody({ acceptTerms: false }))).status).toBe(422)
      expect((await call('POST', '/donations', 'doador', donationBody({ category: 'PERECIVEL' }))).status).toBe(422)
    })

    it('doador cria a própria doação', async () => {
      const res = await call('POST', '/donations', 'doador', donationBody({ description: 'Lote do teste' }))
      expect(res.status).toBe(201)
      donationId = (await res.json()).data.id
    })

    it('outro doador não vê, não vê o histórico e não cancela a doação alheia', async () => {
      expect((await call('GET', `/donations/${donationId}`, 'outrodoador')).status).toBe(403)
      expect((await call('GET', `/donations/${donationId}/events`, 'outrodoador')).status).toBe(403)
      expect((await call('PATCH', `/donations/${donationId}/cancel`, 'outrodoador')).status).toBe(403)
    })

    it('a lista de cada papel mostra só o que lhe cabe', async () => {
      const mine = (await (await call('GET', '/donations', 'doador')).json()).data.data
      const others = (await (await call('GET', '/donations', 'outrodoador')).json()).data.data
      const recipient = (await (await call('GET', '/donations', 'receptor')).json()).data.data
      const admin = (await (await call('GET', '/donations', 'admin')).json()).data.data
      expect(mine.length).toBeGreaterThanOrEqual(2)
      expect(others).toHaveLength(0)
      expect(recipient).toHaveLength(0) // ninguém reservou para ele ainda
      expect(admin.length).toBe(mine.length)
    })

    it('só o administrador casa; só o receptor reserva', async () => {
      expect((await call('PATCH', `/donations/${donationId}/match`, 'receptor', { recipientId: 'x' })).status).toBe(403)
      expect((await call('PATCH', `/donations/${donationId}/match`, 'doador', { recipientId: 'x' })).status).toBe(403)
      expect((await call('PATCH', `/donations/${donationId}/reserve`, 'doador')).status).toBe(403)
      expect((await call('PATCH', `/donations/${donationId}/reserve`, 'admin')).status).toBe(403)
    })

    it('oportunidades: receptor e administrador veem; doador não', async () => {
      expect((await call('GET', '/donations/opportunities', 'doador')).status).toBe(403)
      const asRecipient = await call('GET', '/donations/opportunities', 'receptor')
      expect(asRecipient.status).toBe(200) // e não foi capturada como "/donations/:id"
      const body = await asRecipient.json()
      expect(body.data.data.length).toBeGreaterThanOrEqual(1)
      expect(body.data.data[0].donor).not.toHaveProperty('address')
      expect((await call('GET', '/donations/opportunities', 'admin')).status).toBe(200)
    })

    it('reserva: o primeiro receptor leva, o segundo recebe 409', async () => {
      expect((await call('PATCH', `/donations/${donationId}/reserve`, 'receptor')).status).toBe(200)
      expect((await call('PATCH', `/donations/${donationId}/reserve`, 'outroreceptor')).status).toBe(409)
    })

    it('outro receptor não libera nem confirma a reserva alheia; o dono libera', async () => {
      expect((await call('PATCH', `/donations/${donationId}/release`, 'outroreceptor')).status).toBe(403)
      expect((await call('PATCH', `/donations/${donationId}/confirm-receipt`, 'outroreceptor')).status).toBe(403)
      expect((await call('PATCH', `/donations/${donationId}/release`, 'receptor')).status).toBe(200)
    })

    it('comprovante: não existe antes da coleta e receptor nunca o emite', async () => {
      expect((await call('GET', `/donations/${donationId}/receipt`, 'admin')).status).toBe(422)
      expect((await call('GET', `/donations/${donationId}/receipt`, 'receptor')).status).toBe(403)
    })
  })

  describe('áreas só da administração', () => {
    it.each([
      ['GET', '/reports/rates'],
      ['GET', '/reports/summary'],
      ['GET', '/reports/donations.csv'],
      ['GET', '/pickup-routes'],
      ['GET', '/volunteers'],
      ['GET', '/vehicles'],
      ['GET', '/donors'],
      ['GET', '/recipients'],
    ])('%s %s: doador e receptor recebem 403; administrador, 200', async (method, path) => {
      expect((await call(method, path, 'doador')).status).toBe(403)
      expect((await call(method, path, 'receptor')).status).toBe(403)
      expect((await call(method, path, 'admin')).status).toBe(200)
    })

    it('o CSV sai com o tipo e o nome de arquivo corretos', async () => {
      const res = await call('GET', '/reports/donations.csv', 'admin')
      expect(res.headers.get('content-type')).toMatch(/text\/csv/)
      expect(res.headers.get('content-disposition')).toMatch(/attachment; filename="doacoes-\d{4}-\d{2}-\d{2}\.csv"/)
      // o BOM UTF-8 (EF BB BF) precisa estar nos bytes: res.text() o descartaria
      const bytes = new Uint8Array(await res.arrayBuffer())
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      expect(new TextDecoder('utf-8').decode(bytes.slice(3)).startsWith('Código;Doador')).toBe(true)
    })

    it('período inválido nos relatórios: 422', async () => {
      expect((await call('GET', '/reports/rates?from=2026-11-10&to=2026-11-01', 'admin')).status).toBe(422)
      expect((await call('GET', '/reports/rates?from=ontem', 'admin')).status).toBe(422)
    })
  })

  describe('cadastros: cada um só acessa o próprio', () => {
    it('doador acessa o próprio cadastro e não o de outro; receptor não acessa cadastro de doador', async () => {
      const mine = await prisma.donor.findFirstOrThrow({ where: { user: { email: 'doador@t.org' } } })
      const theirs = await prisma.donor.findFirstOrThrow({ where: { user: { email: 'outrodoador@t.org' } } })
      expect((await call('GET', `/donors/${mine.id}`, 'doador')).status).toBe(200)
      expect((await call('GET', `/donors/${theirs.id}`, 'doador')).status).toBe(403)
      expect((await call('GET', `/donors/${mine.id}`, 'receptor')).status).toBe(403)
    })
  })

  describe('notificações: cada usuário só vê as suas', () => {
    it('o receptor da mesma cidade foi avisado da nova doação e o doador autor não', async () => {
      const recipient = (await (await call('GET', '/notifications', 'receptor')).json()).data
      const donor = (await (await call('GET', '/notifications', 'doador')).json()).data
      expect(recipient.unreadCount).toBeGreaterThan(0)
      expect(recipient.items[0].message).toMatch(/Nova doação disponível/)
      expect(donor.items.every((n: { message: string }) => !/Nova doação disponível/.test(n.message))).toBe(true)
    })

    it('marcar como lida a notificação de outra pessoa: 404; a própria: 200', async () => {
      const [mine] = (await (await call('GET', '/notifications', 'receptor')).json()).data.items
      expect((await call('PATCH', `/notifications/${mine.id}/read`, 'outroreceptor')).status).toBe(404)
      expect((await call('PATCH', `/notifications/${mine.id}/read`, 'receptor')).status).toBe(200)
      expect((await call('PATCH', '/notifications/read-all', 'receptor')).status).toBe(200)
      expect((await (await call('GET', '/notifications', 'receptor')).json()).data.unreadCount).toBe(0)
    })
  })
})
