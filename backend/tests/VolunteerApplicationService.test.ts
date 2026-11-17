import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApplicationStatus } from '@prisma/client'
import { VolunteerApplicationService } from '../src/services/VolunteerApplicationService'
import { ConflictError, NotFoundError, ValidationError } from '../src/utils/AppError'

const tx = vi.hoisted(() => ({ volunteer: { create: vi.fn() }, volunteerApplication: { updateMany: vi.fn() } }))
const mockPrisma = vi.hoisted(() => ({
  volunteerApplication: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  volunteer: { findUnique: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))

const notifyAdmins = vi.hoisted(() => vi.fn())
vi.mock('../src/services/NotificationService', () => ({ NotificationService: class { notifyAdmins = notifyAdmins } }))
const send = vi.hoisted(() => vi.fn())
vi.mock('../src/services/EmailService', () => ({ emailService: { send } }))

const input = { name: ' Carlos Andrade ', phone: '(15) 99999-1111', email: ' Carlos@Email.com ', city: ' Sorocaba ', availability: ['FIM_DE_SEMANA' as const], hasVehicle: true, message: ' tenho uma Fiorino ' }
const pending = (over: Record<string, unknown> = {}) => ({ id: 'a1', name: 'Carlos Andrade', phone: '15999991111', email: 'carlos@email.com', status: ApplicationStatus.PENDENTE, ...over })

describe('VolunteerApplicationService', () => {
  const service = new VolunteerApplicationService()

  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx))
    tx.volunteer.create.mockResolvedValue({ id: 'v1', name: 'Carlos Andrade' })
    tx.volunteerApplication.updateMany.mockResolvedValue({ count: 1 })
  })

  describe('submit', () => {
    it('grava os dados normalizados (telefone só com dígitos, e-mail minúsculo), com o aceite, e avisa a administração', async () => {
      mockPrisma.volunteerApplication.findFirst.mockResolvedValue(null)
      mockPrisma.volunteerApplication.create.mockResolvedValue({ id: 'a1' })

      await service.submit(input)

      const data = mockPrisma.volunteerApplication.create.mock.calls[0][0].data
      expect(data).toMatchObject({ name: 'Carlos Andrade', phone: '15999991111', email: 'carlos@email.com', city: 'Sorocaba', hasVehicle: true, message: 'tenho uma Fiorino' })
      expect(data.consentAt).toBeInstanceOf(Date)
      expect(data).not.toHaveProperty('document') // CPF não é coletado no formulário público
      expect(notifyAdmins).toHaveBeenCalledWith(expect.stringContaining('Carlos Andrade'), '/voluntarios?aba=inscricoes')
    })

    it('o mesmo telefone não duplica uma inscrição pendente', async () => {
      mockPrisma.volunteerApplication.findFirst.mockResolvedValue(pending())
      await expect(service.submit(input)).rejects.toBeInstanceOf(ConflictError)
      expect(mockPrisma.volunteerApplication.create).not.toHaveBeenCalled()
      expect(mockPrisma.volunteerApplication.findFirst.mock.calls[0][0].where).toEqual({ phone: '15999991111', status: 'PENDENTE' })
    })
  })

  describe('approve', () => {
    beforeEach(() => {
      mockPrisma.volunteerApplication.findUnique.mockResolvedValue(pending())
      mockPrisma.volunteer.findUnique.mockResolvedValue(null)
    })

    it('cria o voluntário com o CPF informado pela administração e marca a inscrição como aprovada', async () => {
      const volunteer = await service.approve('a1', { document: '52998224725' })

      expect(volunteer.id).toBe('v1')
      expect(tx.volunteer.create.mock.calls[0][0].data).toEqual({ name: 'Carlos Andrade', document: '529.982.247-25', phone: '15999991111' })
      expect(tx.volunteerApplication.updateMany.mock.calls[0][0]).toMatchObject({
        where: { id: 'a1', status: 'PENDENTE' },
        data: { status: 'APROVADA', volunteerId: 'v1' },
      })
      expect(send).toHaveBeenCalledWith(expect.objectContaining({ to: 'carlos@email.com' }))
    })

    it('CPF inválido é recusado, sem criar nada', async () => {
      await expect(service.approve('a1', { document: '111.111.111-11' })).rejects.toBeInstanceOf(ValidationError)
      expect(tx.volunteer.create).not.toHaveBeenCalled()
    })

    it('CPF que já é de outro voluntário: conflito com o nome dele', async () => {
      mockPrisma.volunteer.findUnique.mockResolvedValue({ id: 'v9', name: 'Maria' })
      await expect(service.approve('a1', { document: '52998224725' })).rejects.toThrow(/Maria/)
    })

    it('só inscrição pendente pode ser analisada; inexistente é 404', async () => {
      mockPrisma.volunteerApplication.findUnique.mockResolvedValue(pending({ status: ApplicationStatus.APROVADA }))
      await expect(service.approve('a1', { document: '52998224725' })).rejects.toThrow(/já foi analisada/)
      mockPrisma.volunteerApplication.findUnique.mockResolvedValue(null)
      await expect(service.approve('x', { document: '52998224725' })).rejects.toBeInstanceOf(NotFoundError)
    })

    it('se outra pessoa decidiu no mesmo instante, desfaz (a transação falha)', async () => {
      tx.volunteerApplication.updateMany.mockResolvedValue({ count: 0 })
      await expect(service.approve('a1', { document: '52998224725' })).rejects.toBeInstanceOf(ConflictError)
      expect(send).not.toHaveBeenCalled()
    })

    it('sem e-mail na inscrição, não tenta enviar', async () => {
      mockPrisma.volunteerApplication.findUnique.mockResolvedValue(pending({ email: null }))
      await service.approve('a1', { document: '52998224725' })
      expect(send).not.toHaveBeenCalled()
    })
  })

  describe('reject', () => {
    it('recusa guardando o motivo (que fica só para a administração) e avisa a pessoa com texto neutro', async () => {
      mockPrisma.volunteerApplication.findUnique.mockResolvedValue(pending())
      mockPrisma.volunteerApplication.updateMany.mockResolvedValue({ count: 1 })

      await service.reject('a1', { note: ' sem disponibilidade em Sorocaba ' })

      expect(mockPrisma.volunteerApplication.updateMany.mock.calls[0][0].data).toMatchObject({ status: 'RECUSADA', reviewNote: 'sem disponibilidade em Sorocaba' })
      const mail = send.mock.calls[0][0]
      expect(mail.text).not.toContain('sem disponibilidade')
    })

    it('inscrição já analisada não é recusada de novo', async () => {
      mockPrisma.volunteerApplication.findUnique.mockResolvedValue(pending({ status: ApplicationStatus.RECUSADA }))
      await expect(service.reject('a1', {})).rejects.toBeInstanceOf(ValidationError)
    })
  })

  describe('list', () => {
    it('pendentes: as mais antigas primeiro; demais: as mais recentes', async () => {
      mockPrisma.volunteerApplication.findMany.mockResolvedValue([])
      mockPrisma.volunteerApplication.count.mockResolvedValue(0)
      await service.list({ status: ApplicationStatus.PENDENTE }, { page: 1, limit: 20, skip: 0 })
      expect(mockPrisma.volunteerApplication.findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: 'asc' })
      await service.list({}, { page: 1, limit: 20, skip: 0 })
      expect(mockPrisma.volunteerApplication.findMany.mock.calls[1][0].orderBy).toEqual({ createdAt: 'desc' })
    })
  })
})
