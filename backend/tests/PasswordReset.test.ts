import { describe, it, expect, vi, beforeEach } from 'vitest'
import bcrypt from 'bcryptjs'
import { createHash } from 'node:crypto'
import { AuthService } from '../src/services/AuthService'
import { NotFoundError, ValidationError } from '../src/utils/AppError'

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  passwordResetToken: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))
vi.mock('../src/services/GeocodingService', () => ({ geocoder: { geocodeStoredProfile: vi.fn() } }))

const send = vi.hoisted(() => vi.fn())
vi.mock('../src/services/EmailService', () => ({
  emailService: { send },
  absoluteLink: (l: string) => `https://app.test${l}`,
}))

const sha = (v: string) => createHash('sha256').update(v).digest('hex')

describe('recuperação de senha', () => {
  const service = new AuthService()

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]))
  })

  it('e-mail sem cadastro: não faz nada (e não revela que não existe)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    await expect(service.forgotPassword('ninguem@x.com')).resolves.toBeUndefined()
    expect(mockPrisma.passwordResetToken.create).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it('conta existente: guarda só o hash do token e envia o link por e-mail', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.com', active: true })
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue(null)

    await service.forgotPassword('a@x.com')

    const stored = mockPrisma.passwordResetToken.create.mock.calls[0][0].data
    expect(stored.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    const mail = send.mock.calls[0][0]
    const token = new URL(mail.action.link).searchParams.get('token')!
    expect(token).toHaveLength(64)
    expect(sha(token)).toBe(stored.tokenHash)
    expect(stored.tokenHash).not.toBe(token)
  })

  it('pedido repetido em menos de 1 minuto é ignorado (sem inundar o e-mail da pessoa)', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', email: 'a@x.com', active: true })
    mockPrisma.passwordResetToken.findFirst.mockResolvedValue({ id: 'recente' })
    await service.forgotPassword('a@x.com')
    expect(send).not.toHaveBeenCalled()
  })

  it('redefine: troca a senha, derruba as sessões e invalida os outros links', async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({ userId: 'u1', usedAt: null, expiresAt: new Date(Date.now() + 60_000) })
    mockPrisma.user.update.mockResolvedValue({})
    mockPrisma.passwordResetToken.updateMany.mockResolvedValue({})

    await service.resetPassword('abc'.repeat(22), 'NovaSenha1')

    expect(mockPrisma.passwordResetToken.findUnique.mock.calls[0][0].where.tokenHash).toBe(sha('abc'.repeat(22)))
    const data = mockPrisma.user.update.mock.calls[0][0].data
    expect(await bcrypt.compare('NovaSenha1', data.password)).toBe(true)
    expect(data).toMatchObject({ refreshToken: null, failedLoginAttempts: 0, lockedUntil: null })
    expect(mockPrisma.passwordResetToken.updateMany.mock.calls[0][0].where).toEqual({ userId: 'u1', usedAt: null })
  })

  it.each([
    ['inexistente', null],
    ['já usado', { userId: 'u1', usedAt: new Date(), expiresAt: new Date(Date.now() + 60_000) }],
    ['expirado', { userId: 'u1', usedAt: null, expiresAt: new Date(Date.now() - 1000) }],
  ])('link %s é recusado', async (_nome, record) => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue(record)
    await expect(service.resetPassword('x'.repeat(30), 'NovaSenha1')).rejects.toBeInstanceOf(ValidationError)
    expect(mockPrisma.user.update).not.toHaveBeenCalled()
  })

  it('a administração gera o link para quem está sem e-mail', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ id: 'u1', active: true })
    const out = await service.createResetLinkForUser('u1')
    expect(out.link).toMatch(/^https:\/\/app\.test\/redefinir-senha\?token=[0-9a-f]{64}$/)
    expect(out.expiresAt.getTime()).toBeGreaterThan(Date.now())

    mockPrisma.user.findUnique.mockResolvedValue(null)
    await expect(service.createResetLinkForUser('nope')).rejects.toBeInstanceOf(NotFoundError)
  })
})
