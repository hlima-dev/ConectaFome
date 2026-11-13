import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DonationAction, DonationStatus, PickupFailureReason, PickupRouteStatus } from '@prisma/client'
import { PickupRouteService } from '../src/services/PickupRouteService'
import { NotFoundError, ValidationError } from '../src/utils/AppError'

const mockPrisma = vi.hoisted(() => ({
  pickupRoute: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
  donation: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  donationEvent: {
    create: vi.fn(),
  },
  vehicle: {
    findUnique: vi.fn(),
  },
  volunteer: {
    findUnique: vi.fn(),
  },
  $transaction: vi.fn(),
}))

vi.mock('../src/config/prisma', () => ({ prisma: mockPrisma }))

const notify = vi.hoisted(() => vi.fn())
vi.mock('../src/services/NotificationService', () => ({
  NotificationService: class {
    onDonationEvent = notify
  },
}))

describe('PickupRouteService', () => {
  let service: PickupRouteService

  beforeEach(() => {
    vi.clearAllMocks()
    service = new PickupRouteService()
    mockPrisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]))
  })

  describe('create', () => {
    it('cria uma rota com veículo e voluntário ativos', async () => {
      mockPrisma.vehicle.findUnique.mockResolvedValue({ id: 'v1', active: true })
      mockPrisma.volunteer.findUnique.mockResolvedValue({ id: 'vol1', active: true })
      mockPrisma.pickupRoute.create.mockResolvedValue({ id: 'r1' })

      await service.create({ vehicleId: 'v1', volunteerId: 'vol1', scheduledFor: new Date() })

      expect(mockPrisma.pickupRoute.create).toHaveBeenCalled()
    })

    it('rejeita veículo inativo/inexistente', async () => {
      mockPrisma.vehicle.findUnique.mockResolvedValue(null)
      await expect(
        service.create({ vehicleId: 'v1', volunteerId: 'vol1', scheduledFor: new Date() }),
      ).rejects.toThrow(NotFoundError)
    })

    it('rejeita voluntário inativo/inexistente', async () => {
      mockPrisma.vehicle.findUnique.mockResolvedValue({ id: 'v1', active: true })
      mockPrisma.volunteer.findUnique.mockResolvedValue({ id: 'vol1', active: false })
      await expect(
        service.create({ vehicleId: 'v1', volunteerId: 'vol1', scheduledFor: new Date() }),
      ).rejects.toThrow(NotFoundError)
    })
  })

  describe('attachDonation', () => {
    it('anexa uma doação RESERVADA e sem rota', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ id: 'r1', status: PickupRouteStatus.PLANEJADA })
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'd1', status: DonationStatus.RESERVADA, routeId: null })
      mockPrisma.donation.update.mockResolvedValue({})

      await service.attachDonation('r1', 'd1', 'admin_1')

      expect(mockPrisma.donation.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { status: DonationStatus.AGENDADA, routeId: 'r1', pickupFailureReason: null, pickupFailureNote: null, pickupFailedAt: null, failedRouteId: null },
      })
      expect(notify).toHaveBeenCalledWith(DonationAction.AGENDADA, 'd1', 'admin_1')
      expect(mockPrisma.donationEvent.create).toHaveBeenCalledWith({
        data: {
          donationId: 'd1',
          action: DonationAction.AGENDADA,
          fromStatus: DonationStatus.RESERVADA,
          toStatus: DonationStatus.AGENDADA,
          actorId: 'admin_1',
        },
      })
    })

    it('rejeita anexar numa rota que não está PLANEJADA', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ id: 'r1', status: PickupRouteStatus.EM_ANDAMENTO })
      await expect(service.attachDonation('r1', 'd1')).rejects.toThrow(ValidationError)
    })

    it('rejeita anexar doação que já está em outra rota', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ id: 'r1', status: PickupRouteStatus.PLANEJADA })
      mockPrisma.donation.findUnique.mockResolvedValue({
        id: 'd1',
        status: DonationStatus.RESERVADA,
        routeId: 'r2',
      })
      await expect(service.attachDonation('r1', 'd1')).rejects.toThrow(ValidationError)
    })

    it('rejeita anexar doação que não está RESERVADA', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ id: 'r1', status: PickupRouteStatus.PLANEJADA })
      mockPrisma.donation.findUnique.mockResolvedValue({
        id: 'd1',
        status: DonationStatus.DISPONIVEL,
        routeId: null,
      })
      await expect(service.attachDonation('r1', 'd1')).rejects.toThrow(ValidationError)
    })
  })

  describe('detachDonation', () => {
    it('desanexa e devolve a doação pra RESERVADA', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ id: 'r1', status: PickupRouteStatus.PLANEJADA })
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'd1', routeId: 'r1', status: DonationStatus.AGENDADA })
      mockPrisma.donation.update.mockResolvedValue({})

      await service.detachDonation('r1', 'd1', 'admin_1')

      expect(mockPrisma.donation.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { status: DonationStatus.RESERVADA, routeId: null },
      })
      expect(mockPrisma.donationEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: DonationAction.DESAGENDADA,
          fromStatus: DonationStatus.AGENDADA,
          toStatus: DonationStatus.RESERVADA,
          actorId: 'admin_1',
        }),
      })
    })

    it('rejeita desanexar doação que não pertence à rota', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ id: 'r1', status: PickupRouteStatus.PLANEJADA })
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'd1', routeId: 'r2' })
      await expect(service.detachDonation('r1', 'd1')).rejects.toThrow(NotFoundError)
    })
  })

  describe('start', () => {
    const planned = (donations: { estimatedQuantityKg: number }[], capacityKg: number | null = null) => ({
      id: 'r1',
      status: PickupRouteStatus.PLANEJADA,
      vehicle: { capacityKg },
      donations,
    })

    it('inicia uma rota planejada com ao menos 1 doação anexada', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue(planned([{ estimatedQuantityKg: 10 }, { estimatedQuantityKg: 5 }]))
      mockPrisma.pickupRoute.update.mockResolvedValue({ id: 'r1', status: PickupRouteStatus.EM_ANDAMENTO })

      await service.start('r1')

      expect(mockPrisma.pickupRoute.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: PickupRouteStatus.EM_ANDAMENTO }) }),
      )
    })

    it('rejeita iniciar sem nenhuma doação anexada', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue(planned([]))
      await expect(service.start('r1')).rejects.toThrow(ValidationError)
    })

    it('rejeita iniciar uma rota que não está planejada', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ id: 'r1', status: PickupRouteStatus.CONCLUIDA })
      await expect(service.start('r1')).rejects.toThrow(ValidationError)
    })

    it('rota inexistente', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue(null)
      await expect(service.start('x')).rejects.toThrow(NotFoundError)
    })

    it('bloqueia a saída quando o peso estimado passa da capacidade do veículo', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue(planned([{ estimatedQuantityKg: 300 }, { estimatedQuantityKg: 250 }], 500))
      await expect(service.start('r1')).rejects.toThrow(/550 kg\) excede a capacidade do veículo \(500 kg\)/)
      expect(mockPrisma.pickupRoute.update).not.toHaveBeenCalled()
    })

    it('peso exatamente igual à capacidade pode sair', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue(planned([{ estimatedQuantityKg: 500 }], 500))
      mockPrisma.pickupRoute.update.mockResolvedValue({ id: 'r1' })
      await service.start('r1')
      expect(mockPrisma.pickupRoute.update).toHaveBeenCalled()
    })

    it('veículo sem capacidade cadastrada não é verificado', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue(planned([{ estimatedQuantityKg: 99999 }], null))
      mockPrisma.pickupRoute.update.mockResolvedValue({ id: 'r1' })
      await service.start('r1')
      expect(mockPrisma.pickupRoute.update).toHaveBeenCalled()
    })
  })

  describe('findById — plano e carga', () => {
    const hours = (h: number) => new Date(Date.now() + h * 3_600_000)
    const donation = (id: string, donorId: string, lat: number | null, lng: number | null, kg: number, end: number, recipient: unknown = null) => ({
      id,
      description: `doação ${id}`,
      status: DonationStatus.AGENDADA,
      estimatedQuantityKg: String(kg),
      bestBeforeDate: null,
      pickupWindowEnd: hours(end),
      donor: { id: donorId, name: donorId, address: `Rua ${donorId}`, city: 'Sorocaba', latitude: lat, longitude: lng },
      recipient,
    })

    it('devolve carga, paradas ordenadas, paradas sem coordenadas e receptores', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({
        id: 'r1',
        vehicle: { capacityKg: '100' },
        donations: [
          donation('1', 'longe', 0, 0.5, 10, 30),
          donation('2', 'urgente', 0, 0, 20, 4, { id: 'rec1', name: 'ONG', address: 'Rua O', latitude: 1, longitude: 1 }),
          donation('3', 'semgeo', null, null, 5, 20),
          donation('4', 'urgente', 0, 0, 7, 4),
        ],
      })

      const route = await service.findById('r1')

      expect(route.load).toEqual({ totalKg: 42, capacityKg: 100, exceeds: false, remainingKg: 58 })
      expect(route.plan.stops.map((s) => s.donorId)).toEqual(['urgente', 'longe'])
      expect(route.plan.stops[0].donations.map((d) => d.id)).toEqual(['2', '4'])
      expect(route.plan.unlocated.map((s) => s.donorId)).toEqual(['semgeo'])
      expect(route.plan.totalKm).toBeGreaterThan(0)
      expect(route.plan.recipients).toEqual([{ id: 'rec1', name: 'ONG', address: 'Rua O', latitude: 1, longitude: 1 }])
    })

    it('rota sem doações: plano vazio e carga zero', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ id: 'r1', vehicle: { capacityKg: null }, donations: [] })
      const route = await service.findById('r1')
      expect(route.plan).toEqual({ stops: [], totalKm: 0, unlocated: [], recipients: [] })
      expect(route.load).toMatchObject({ totalKg: 0, exceeds: false, capacityKg: null })
    })

    it('marca excedente quando o peso passa da capacidade', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({
        id: 'r1',
        vehicle: { capacityKg: 10 },
        donations: [donation('1', 'a', 0, 0, 30, 10)],
      })
      expect((await service.findById('r1')).load).toMatchObject({ exceeds: true, remainingKg: -20 })
    })
  })

  describe('complete', () => {
    it('conclui a rota e marca as doações anexadas como COLETADA usando o estimado como padrão', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ id: 'r1', status: PickupRouteStatus.EM_ANDAMENTO })
      mockPrisma.donation.findMany.mockResolvedValue([
        { id: 'd1', status: DonationStatus.AGENDADA, estimatedQuantityKg: 10 },
        { id: 'd2', status: DonationStatus.AGENDADA, estimatedQuantityKg: 5 },
      ])
      mockPrisma.donation.update.mockResolvedValue({})
      mockPrisma.pickupRoute.update.mockResolvedValue({})

      await service.complete('r1', [{ donationId: 'd1', collectedQuantityKg: 8 }], 'admin_1')

      expect(mockPrisma.donation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'd1' },
          data: expect.objectContaining({ status: DonationStatus.COLETADA, collectedQuantityKg: 8 }),
        }),
      )
      expect(mockPrisma.donation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'd2' },
          data: expect.objectContaining({ status: DonationStatus.COLETADA, collectedQuantityKg: 5 }),
        }),
      )
      expect(notify).toHaveBeenCalledWith(DonationAction.COLETADA, 'd1', 'admin_1')
      expect(notify).toHaveBeenCalledWith(DonationAction.COLETADA, 'd2', 'admin_1')
      // um evento COLETADA por doação, com o usuário que concluiu a rota
      const events = mockPrisma.donationEvent.create.mock.calls.map((c) => c[0].data)
      expect(events).toHaveLength(2)
      expect(events).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ donationId: 'd1', action: DonationAction.COLETADA, actorId: 'admin_1' }),
          expect.objectContaining({ donationId: 'd2', action: DonationAction.COLETADA, actorId: 'admin_1' }),
        ]),
      )
    })

    it('rejeita concluir uma rota que não está em andamento', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ id: 'r1', status: PickupRouteStatus.PLANEJADA })
      await expect(service.complete('r1')).rejects.toThrow(ValidationError)
    })
  })

  describe('cancel', () => {
    it('cancela a rota e devolve as doações anexadas pra RESERVADA', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ id: 'r1', status: PickupRouteStatus.PLANEJADA })
      mockPrisma.donation.findMany.mockResolvedValue([
        { id: 'd1', status: DonationStatus.AGENDADA },
        { id: 'd2', status: DonationStatus.AGENDADA },
      ])
      mockPrisma.donation.update.mockResolvedValue({})
      mockPrisma.pickupRoute.update.mockResolvedValue({})

      await service.cancel('r1', 'admin_1')

      expect(mockPrisma.donation.update).toHaveBeenCalledWith({
        where: { id: 'd1' },
        data: { status: DonationStatus.RESERVADA, routeId: null },
      })
      expect(mockPrisma.donation.update).toHaveBeenCalledWith({
        where: { id: 'd2' },
        data: { status: DonationStatus.RESERVADA, routeId: null },
      })
      expect(mockPrisma.donationEvent.create).toHaveBeenCalledTimes(2)
      expect(notify).toHaveBeenCalledTimes(2)
    })

    it('rejeita cancelar uma rota que já não está mais planejada', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ id: 'r1', status: PickupRouteStatus.CONCLUIDA })
      await expect(service.cancel('r1')).rejects.toThrow(ValidationError)
    })
  })

  describe('paradas: coletar e falhar uma a uma', () => {
    const route = { id: 'r1', status: PickupRouteStatus.EM_ANDAMENTO }
    const stop = (over: Record<string, unknown> = {}) => ({ id: 'd1', routeId: 'r1', status: DonationStatus.AGENDADA, estimatedQuantityKg: 20, ...over })

    beforeEach(() => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ ...route, donations: [], vehicle: null, volunteer: null })
      mockPrisma.donation.findUnique.mockResolvedValue(stop())
    })

    it('coleta a parada: COLETADA na hora, com a quantidade conferida e quem agiu', async () => {
      await service.collectStop('r1', 'd1', { quantityKg: 18.5 }, { label: 'Voluntário Carlos (link de campo)' })

      expect(mockPrisma.donation.update.mock.calls[0][0].data).toMatchObject({ status: DonationStatus.COLETADA, collectedQuantityKg: 18.5 })
      expect(mockPrisma.donationEvent.create.mock.calls[0][0].data).toMatchObject({
        action: DonationAction.COLETADA,
        actorLabel: 'Voluntário Carlos (link de campo)',
      })
      expect(notify).toHaveBeenCalledWith(DonationAction.COLETADA, 'd1', undefined)
    })

    it('sem informar quantidade, vale a estimada', async () => {
      await service.collectStop('r1', 'd1', {})
      expect(mockPrisma.donation.update.mock.calls[0][0].data.collectedQuantityKg).toBe(20)
    })

    it('só com a rota em andamento', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue({ ...route, status: PickupRouteStatus.PLANEJADA })
      await expect(service.collectStop('r1', 'd1', {})).rejects.toBeInstanceOf(ValidationError)
    })

    it('parada de outra rota ou já resolvida é recusada', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue(stop({ routeId: 'outra' }))
      await expect(service.collectStop('r1', 'd1', {})).rejects.toBeInstanceOf(NotFoundError)

      mockPrisma.donation.findUnique.mockResolvedValue(stop({ status: DonationStatus.COLETADA }))
      await expect(service.collectStop('r1', 'd1', {})).rejects.toThrow(/já foi resolvida/)
    })

    it('doador ausente: a doação sai da rota e volta a RESERVADA para reagendar, com o motivo guardado', async () => {
      await service.failStop('r1', 'd1', { reason: PickupFailureReason.DOADOR_AUSENTE }, { userId: 'adm' })

      const first = mockPrisma.donation.update.mock.calls[0][0].data
      expect(first).toMatchObject({ status: DonationStatus.RESERVADA, routeId: null })
      expect(mockPrisma.donation.update.mock.calls[1][0].data).toMatchObject({ pickupFailureReason: 'DOADOR_AUSENTE', failedRouteId: 'r1' })
      expect(mockPrisma.donationEvent.create.mock.calls[0][0].data).toMatchObject({ action: DonationAction.COLETA_FALHOU, detail: 'Doador ausente' })
      expect(notify).toHaveBeenCalledWith(DonationAction.COLETA_FALHOU, 'd1', 'adm', 'Doador ausente')
    })

    it('produto impróprio: cancela a doação', async () => {
      await service.failStop('r1', 'd1', { reason: PickupFailureReason.PRODUTO_IMPROPRIO, note: 'cheiro forte' }, {})
      expect(mockPrisma.donation.update.mock.calls[0][0].data).toMatchObject({ status: DonationStatus.CANCELADA, routeId: null })
      expect(mockPrisma.donationEvent.create.mock.calls[0][0].data.detail).toBe('Produto impróprio para consumo (cheiro forte)')
    })

    it('"Outro" exige descrever o que aconteceu', async () => {
      await expect(service.failStop('r1', 'd1', { reason: PickupFailureReason.OUTRO }, {})).rejects.toThrow(/Descreva/)
    })

    it('concluir a rota depois não repete o que já foi coletado', async () => {
      mockPrisma.pickupRoute.findUnique.mockResolvedValue(route)
      mockPrisma.donation.findMany.mockResolvedValue([])
      await service.complete('r1', [], 'adm')
      expect(mockPrisma.donation.findMany.mock.calls[0][0].where).toEqual({ routeId: 'r1', status: DonationStatus.AGENDADA })
    })
  })
})
