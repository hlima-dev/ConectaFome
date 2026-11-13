import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApprovalStatus } from '@prisma/client'
import { ApprovalService, assertApproved } from '../src/services/ApprovalService'
import { ForbiddenError, NotFoundError, ValidationError } from '../src/utils/AppError'

const mockPrisma = vi.hoisted(() => ({
  user: { findUnique: vi.fn(), update: vi.fn() },
  donor: { findUnique: vi.fn() },
  recipient: { findUnique: vi.fn() },
}))
vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))

const notifyUsers = vi.hoisted(() => vi.fn())
vi.mock('../src/services/NotificationService', () => ({ NotificationService: class { notifyUsers = notifyUsers } }))

beforeEach(() => vi.clearAllMocks())

describe('assertApproved', () => {
  it('libera quem está aprovado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ approvalStatus: ApprovalStatus.APROVADO })
    await expect(assertApproved('u1')).resolves.toBeUndefined()
  })

  it('barra quem está em análise, com mensagem clara', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ approvalStatus: ApprovalStatus.PENDENTE })
    await expect(assertApproved('u1')).rejects.toThrow(/em análise/)
  })

  it('barra quem foi rejeitado', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ approvalStatus: ApprovalStatus.REJEITADO })
    await expect(assertApproved('u1')).rejects.toThrow(/não foi aprovado/)
  })

  it('barra usuário inexistente', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null)
    await expect(assertApproved('u1')).rejects.toBeInstanceOf(ForbiddenError)
  })
})

describe('ApprovalService.setStatus', () => {
  const service = new ApprovalService()

  it('aprova: grava a data e avisa o usuário', async () => {
    mockPrisma.recipient.findUnique.mockResolvedValue({ userId: 'u9', name: 'ONG X' })
    mockPrisma.user.update.mockResolvedValue({ id: 'u9', approvalStatus: ApprovalStatus.APROVADO })

    await service.setStatus('recipient', 'r1', ApprovalStatus.APROVADO, undefined)

    const data = mockPrisma.user.update.mock.calls[0][0].data
    expect(data.approvalStatus).toBe(ApprovalStatus.APROVADO)
    expect(data.approvedAt).toBeInstanceOf(Date)
    expect(notifyUsers).toHaveBeenCalledWith(['u9'], expect.stringContaining('aprovado'), '/')
  })

  it('rejeita com motivo: o motivo vai para o usuário e a data de aprovação fica nula', async () => {
    mockPrisma.donor.findUnique.mockResolvedValue({ userId: 'u7', name: 'Mercado' })
    mockPrisma.user.update.mockResolvedValue({ id: 'u7' })

    await service.setStatus('donor', 'd1', ApprovalStatus.REJEITADO, ' CNPJ não confere ')

    const data = mockPrisma.user.update.mock.calls[0][0].data
    expect(data.approvedAt).toBeNull()
    expect(data.approvalNote).toBe('CNPJ não confere')
    expect(notifyUsers.mock.calls[0][1]).toContain('Motivo: CNPJ não confere')
  })

  it('cadastro inexistente e cadastro sem conta de acesso são rejeitados', async () => {
    mockPrisma.donor.findUnique.mockResolvedValue(null)
    await expect(service.setStatus('donor', 'x', ApprovalStatus.APROVADO, undefined)).rejects.toBeInstanceOf(NotFoundError)

    mockPrisma.donor.findUnique.mockResolvedValue({ userId: null, name: 'Sem conta' })
    await expect(service.setStatus('donor', 'x', ApprovalStatus.APROVADO, undefined)).rejects.toBeInstanceOf(ValidationError)
  })
})
