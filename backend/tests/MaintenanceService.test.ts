import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DonationAction, DonationStatus } from '@prisma/client'
import { MaintenanceService } from '../src/services/MaintenanceService'

const tx = vi.hoisted(() => ({ donation: { updateMany: vi.fn() }, donationEvent: { create: vi.fn() } }))
const mockPrisma = vi.hoisted(() => ({
  donation: { findMany: vi.fn() },
  donationEvent: { findFirst: vi.fn() },
  $transaction: vi.fn(),
}))
vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))

const notify = vi.hoisted(() => ({ onDonationEvent: vi.fn(), notifyUsers: vi.fn() }))
vi.mock('../src/services/NotificationService', () => ({ NotificationService: class { onDonationEvent = notify.onDonationEvent; notifyUsers = notify.notifyUsers } }))

const NOW = new Date('2026-11-10T12:00:00Z')
const hours = (h: number) => new Date(NOW.getTime() + h * 3_600_000)

beforeEach(() => {
  vi.clearAllMocks()
  mockPrisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) => fn(tx))
  tx.donation.updateMany.mockResolvedValue({ count: 1 })
})

describe('MaintenanceService.expireOverdue', () => {
  const service = new MaintenanceService()

  it('vence só quem de fato passou do prazo, grava o evento sem autor e avisa', async () => {
    mockPrisma.donation.findMany.mockResolvedValue([
      { id: 'old', status: DonationStatus.DISPONIVEL, bestBeforeDate: null, pickupWindowEnd: hours(-2) },
      // a query já filtra por OR; aqui simulamos um que ainda está no prazo (validade só vence no fim do dia)
      { id: 'ok', status: DonationStatus.RESERVADA, bestBeforeDate: null, pickupWindowEnd: hours(5) },
    ])

    const count = await service.expireOverdue(NOW)

    expect(count).toBe(1)
    expect(tx.donation.updateMany.mock.calls[0][0].where).toMatchObject({ id: 'old', status: DonationStatus.DISPONIVEL, routeId: null })
    expect(tx.donationEvent.create.mock.calls[0][0].data).toMatchObject({ action: DonationAction.VENCIDA, actorId: null, toStatus: DonationStatus.VENCIDA })
    expect(notify.onDonationEvent).toHaveBeenCalledWith(DonationAction.VENCIDA, 'old')
  })

  it('se outra pessoa mudou o estado no meio (corrida), não grava evento nem avisa', async () => {
    mockPrisma.donation.findMany.mockResolvedValue([{ id: 'x', status: DonationStatus.DISPONIVEL, bestBeforeDate: null, pickupWindowEnd: hours(-1) }])
    tx.donation.updateMany.mockResolvedValue({ count: 0 })

    expect(await service.expireOverdue(NOW)).toBe(0)
    expect(tx.donationEvent.create).not.toHaveBeenCalled()
    expect(notify.onDonationEvent).not.toHaveBeenCalled()
  })
})

describe('MaintenanceService.releaseStaleReservations', () => {
  const service = new MaintenanceService()
  const stale = { id: 'd1', description: 'Pães', recipient: { userId: 'ur', name: 'ONG' } }

  it('devolve ao painel a reserva feita pelo próprio receptor e avisa quem reservou', async () => {
    mockPrisma.donation.findMany.mockResolvedValue([stale])
    mockPrisma.donationEvent.findFirst.mockResolvedValue({ action: DonationAction.RESERVADA })

    expect(await service.releaseStaleReservations(NOW)).toBe(1)
    expect(tx.donation.updateMany.mock.calls[0][0].data).toMatchObject({ status: DonationStatus.DISPONIVEL, recipientId: null })
    expect(tx.donationEvent.create.mock.calls[0][0].data).toMatchObject({ action: DonationAction.LIBERADA, actorId: null })
    expect(notify.notifyUsers).toHaveBeenCalledWith(['ur'], expect.stringContaining('expirou'), '/doacoes/d1')
  })

  it('não mexe em casamento feito pela administração', async () => {
    mockPrisma.donation.findMany.mockResolvedValue([stale])
    mockPrisma.donationEvent.findFirst.mockResolvedValue({ action: DonationAction.CASADA })

    expect(await service.releaseStaleReservations(NOW)).toBe(0)
    expect(tx.donation.updateMany).not.toHaveBeenCalled()
  })
})
