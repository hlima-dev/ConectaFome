import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DonationAction, DonationStatus, FoodCategory, Role, StorageCondition } from '@prisma/client'
import { DonationService } from '../src/services/DonationService'
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../src/utils/AppError'

const mockPrisma = vi.hoisted(() => ({
  donation: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUnique: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  donationEvent: {
    create: vi.fn(),
    findMany: vi.fn(),
  },
  donor: {
    findUnique: vi.fn(),
  },
  recipient: {
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

const assertApproved = vi.hoisted(() => vi.fn())
vi.mock('../src/services/ApprovalService', () => ({ assertApproved }))

const admin = { id: 'admin_1', role: Role.ADMIN }
const donorUser = { id: 'user_1', role: Role.DOADOR }
const otherDonorUser = { id: 'user_2', role: Role.DOADOR }
const recipientUser = { id: 'user_3', role: Role.RECEPTOR }

const baseInput = {
  description: 'Pães e frutas do dia',
  estimatedQuantityKg: 10,
  pickupWindowStart: new Date('2026-01-01T10:00:00Z'),
  pickupWindowEnd: new Date('2026-01-01T12:00:00Z'),
  acceptTerms: true,
}

describe('DonationService', () => {
  let service: DonationService

  beforeEach(() => {
    vi.clearAllMocks()
    // $transaction([...ops]) com ops já "executadas" pelos mocks: devolve os resultados
    mockPrisma.$transaction.mockImplementation(async (arg: unknown) =>
      typeof arg === 'function' ? (arg as (tx: typeof mockPrisma) => unknown)(mockPrisma) : Promise.all(arg as Promise<unknown>[]),
    )
    service = new DonationService()
  })

  describe('create', () => {
    it('DOADOR cria doação vinculada ao próprio cadastro (ignora donorId do body)', async () => {
      mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd1', active: true })
      mockPrisma.donation.create.mockResolvedValue({ id: 'don1' })

      await service.create({ ...baseInput, donorId: 'outro-id-qualquer' }, donorUser)

      expect(mockPrisma.donation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ donorId: 'd1' }) }),
      )
    })

    it('DOADOR sem cadastro de doador é rejeitado', async () => {
      mockPrisma.donor.findUnique.mockResolvedValue(null)
      await expect(service.create(baseInput, donorUser)).rejects.toThrow(ForbiddenError)
    })

    it('ADMIN precisa informar donorId', async () => {
      await expect(service.create(baseInput, admin)).rejects.toThrow(ValidationError)
    })

    it('ADMIN cria em nome de um donorId informado', async () => {
      mockPrisma.donation.create.mockResolvedValue({ id: 'don1' })
      await service.create({ ...baseInput, donorId: 'd9' }, admin)
      expect(mockPrisma.donation.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ donorId: 'd9' }) }),
      )
    })

    it('RECEPTOR não pode criar doação', async () => {
      await expect(service.create(baseInput, recipientUser)).rejects.toThrow(ForbiddenError)
    })

    it('exige a declaração de que o alimento está próprio para consumo', async () => {
      mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd1', active: true })
      await expect(service.create({ ...baseInput, acceptTerms: false }, donorUser)).rejects.toThrow(
        /próprio para consumo/,
      )
      expect(mockPrisma.donation.create).not.toHaveBeenCalled()
    })

    it('grava o aceite com data e o evento CRIADA com o usuário na mesma criação', async () => {
      mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd1', active: true })
      mockPrisma.donation.create.mockResolvedValue({ id: 'don1' })

      await service.create(baseInput, donorUser)

      const data = mockPrisma.donation.create.mock.calls[0][0].data
      expect(data.termsAcceptedAt).toBeInstanceOf(Date)
      expect(data.events.create).toEqual({
        action: DonationAction.CRIADA,
        fromStatus: null,
        toStatus: DonationStatus.DISPONIVEL,
        actorId: donorUser.id,
      })
    })

    it.each([FoodCategory.PERECIVEL, FoodCategory.PREPARADO])(
      'categoria %s exige condição de armazenamento explícita',
      async (category) => {
        mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd1', active: true })
        await expect(service.create({ ...baseInput, category }, donorUser)).rejects.toThrow(/condição de armazenamento/)
      },
    )

    it('perecível com condição informada é aceito', async () => {
      mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd1', active: true })
      mockPrisma.donation.create.mockResolvedValue({ id: 'don1' })

      await service.create(
        { ...baseInput, category: FoodCategory.PERECIVEL, storageCondition: StorageCondition.REFRIGERADO },
        donorUser,
      )

      expect(mockPrisma.donation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ storageCondition: StorageCondition.REFRIGERADO }),
        }),
      )
    })

    it('categorias não perecíveis não exigem a condição (vale o padrão)', async () => {
      mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd1', active: true })
      mockPrisma.donation.create.mockResolvedValue({ id: 'don1' })
      await service.create({ ...baseInput, category: FoodCategory.NAO_PERECIVEL }, donorUser)
      expect(mockPrisma.donation.create).toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('trocar a categoria para perecível sem informar a condição é rejeitado', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', donorId: 'd1', status: DonationStatus.DISPONIVEL })
      await expect(service.update('don1', { category: FoodCategory.PERECIVEL }, admin)).rejects.toThrow(
        /condição de armazenamento/,
      )
      expect(mockPrisma.donation.update).not.toHaveBeenCalled()
    })
  })

  describe('match', () => {
    it('casa doação DISPONIVEL com um receptor ativo', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', status: DonationStatus.DISPONIVEL })
      mockPrisma.recipient.findUnique.mockResolvedValue({ id: 'r1', active: true })
      mockPrisma.donation.update.mockResolvedValue({ id: 'don1', status: DonationStatus.RESERVADA })

      await service.match('don1', 'r1', admin)

      expect(mockPrisma.donation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DonationStatus.RESERVADA, recipientId: 'r1' }),
        }),
      )
      expect(mockPrisma.donationEvent.create).toHaveBeenCalledWith({
        data: {
          donationId: 'don1',
          action: DonationAction.CASADA,
          fromStatus: DonationStatus.DISPONIVEL,
          toStatus: DonationStatus.RESERVADA,
          actorId: admin.id,
        },
      })
    })

    it('não casa doação que já está agendada em uma rota', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', status: DonationStatus.AGENDADA })
      await expect(service.match('don1', 'r1', admin)).rejects.toThrow(ValidationError)
    })

    it('reatribui uma doação RESERVADA a outro receptor', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', status: DonationStatus.RESERVADA })
      mockPrisma.recipient.findUnique.mockResolvedValue({ id: 'r2', active: true })
      mockPrisma.donation.update.mockResolvedValue({ id: 'don1' })

      await service.match('don1', 'r2', admin)

      expect(mockPrisma.donation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ recipientId: 'r2' }) }),
      )
      expect(notify).toHaveBeenCalledWith(DonationAction.CASADA, 'don1', admin.id)
    })

    it('rejeita receptor inexistente ou inativo', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', status: DonationStatus.DISPONIVEL })
      mockPrisma.recipient.findUnique.mockResolvedValue(null)
      await expect(service.match('don1', 'r1', admin)).rejects.toThrow(NotFoundError)
    })
  })

  describe('cancel', () => {
    it('dono DOADOR cancela a própria doação DISPONIVEL', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', donorId: 'd1', status: DonationStatus.DISPONIVEL })
      mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd1' })
      mockPrisma.donation.update.mockResolvedValue({ id: 'don1', status: DonationStatus.CANCELADA })

      await service.cancel('don1', donorUser)

      expect(mockPrisma.donation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: DonationStatus.CANCELADA }) }),
      )
      expect(mockPrisma.donationEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: DonationAction.CANCELADA, actorId: donorUser.id }),
      })
    })

    it('outro doador não pode cancelar', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', donorId: 'd1', status: DonationStatus.DISPONIVEL })
      mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd2' })
      await expect(service.cancel('don1', otherDonorUser)).rejects.toThrow(ForbiddenError)
    })

    it('não cancela doação já coletada', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', donorId: 'd1', status: DonationStatus.COLETADA })
      await expect(service.cancel('don1', admin)).rejects.toThrow(ValidationError)
    })
  })

  describe('markExpired', () => {
    it('marca DISPONIVEL como VENCIDA', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', donorId: 'd1', status: DonationStatus.DISPONIVEL })
      mockPrisma.donation.update.mockResolvedValue({ id: 'don1', status: DonationStatus.VENCIDA })
      await service.markExpired('don1', admin)
      expect(mockPrisma.donation.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: DonationStatus.VENCIDA, expiredAt: expect.any(Date) }),
        }),
      )
      expect(mockPrisma.donationEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: DonationAction.VENCIDA, toStatus: DonationStatus.VENCIDA }),
      })
    })

    it('não marca como vencida uma doação já agendada', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', donorId: 'd1', status: DonationStatus.AGENDADA })
      await expect(service.markExpired('don1', admin)).rejects.toThrow(ValidationError)
    })
  })

  describe('confirmReceipt', () => {
    it('receptor dono confirma recebimento de doação COLETADA', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({
        id: 'don1',
        recipientId: 'r1',
        status: DonationStatus.COLETADA,
      })
      mockPrisma.recipient.findUnique.mockResolvedValue({ id: 'r1' })
      mockPrisma.donation.update.mockResolvedValue({ id: 'don1', status: DonationStatus.ENTREGUE })

      await service.confirmReceipt('don1', recipientUser)

      expect(mockPrisma.donation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: DonationStatus.ENTREGUE }) }),
      )
      expect(mockPrisma.donationEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: DonationAction.CONFIRMADA,
          fromStatus: DonationStatus.COLETADA,
          actorId: recipientUser.id,
        }),
      })
    })

    it('outro receptor não pode confirmar', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({
        id: 'don1',
        recipientId: 'r1',
        status: DonationStatus.COLETADA,
      })
      mockPrisma.recipient.findUnique.mockResolvedValue({ id: 'r2' })
      await expect(service.confirmReceipt('don1', recipientUser)).rejects.toThrow(ForbiddenError)
    })

    it('não confirma doação que ainda não foi coletada', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({
        id: 'don1',
        recipientId: 'r1',
        status: DonationStatus.AGENDADA,
      })
      mockPrisma.recipient.findUnique.mockResolvedValue({ id: 'r1' })
      await expect(service.confirmReceipt('don1', recipientUser)).rejects.toThrow(ValidationError)
    })
  })

  describe('opportunities', () => {
    const hours = (h: number) => new Date(Date.now() + h * 3_600_000)
    const row = (id: string, pickupWindowEnd: Date, bestBeforeDate: Date | null = null) => ({
      id,
      status: DonationStatus.DISPONIVEL,
      pickupWindowEnd,
      bestBeforeDate,
      donor: { id: 'd1', name: 'Mercado', city: 'Sorocaba', state: 'SP' },
    })
    const page = { page: 1, limit: 20, skip: 0 }

    it('ordena da mais urgente para a menos e esconde as com prazo encerrado', async () => {
      mockPrisma.donation.findMany.mockResolvedValue([row('longe', hours(72)), row('vencida', hours(-1)), row('perto', hours(3))])

      const result = await service.opportunities({}, page, recipientUser)

      expect(result.data.map((d) => d.id)).toEqual(['perto', 'longe'])
      expect(result.data[0].urgency?.level).toBe('URGENT')
      expect(result.meta.total).toBe(2)
    })

    it('a validade que vence antes da janela define a ordem', async () => {
      mockPrisma.donation.findMany.mockResolvedValue([row('janela-longa-validade-curta', hours(100), new Date()), row('b', hours(30))])
      const result = await service.opportunities({}, page, recipientUser)
      // validade "hoje" vence no fim do dia de hoje (UTC): antes das 30 h da outra
      expect(result.data[0].id).toBe('janela-longa-validade-curta')
    })

    it('aplica filtros de cidade e categoria no banco e só lista DISPONÍVEL', async () => {
      mockPrisma.donation.findMany.mockResolvedValue([])
      await service.opportunities({ city: 'soroc', category: FoodCategory.PADARIA }, page, recipientUser)
      const where = mockPrisma.donation.findMany.mock.calls[0][0].where
      expect(where.status).toBe(DonationStatus.DISPONIVEL)
      expect(where.category).toBe(FoodCategory.PADARIA)
      expect(where.donor.city).toEqual({ contains: 'soroc', mode: 'insensitive' })
    })

    it('pagina em memória depois de ordenar', async () => {
      mockPrisma.donation.findMany.mockResolvedValue([row('a', hours(10)), row('b', hours(20)), row('c', hours(30))])
      const result = await service.opportunities({}, { page: 2, limit: 2, skip: 2 }, recipientUser)
      expect(result.data.map((d) => d.id)).toEqual(['c'])
      expect(result.meta).toMatchObject({ total: 3, page: 2, hasPrev: true, hasNext: false })
    })

    it('doador não vê o painel', async () => {
      await expect(service.opportunities({}, page, donorUser)).rejects.toThrow(ForbiddenError)
    })
  })

  describe('reserve', () => {
    const hours = (h: number) => new Date(Date.now() + h * 3_600_000)

    function givenReservable() {
      mockPrisma.recipient.findUnique.mockResolvedValue({ id: 'r1', active: true })
      mockPrisma.donation.findUnique.mockResolvedValue({
        id: 'don1',
        status: DonationStatus.DISPONIVEL,
        bestBeforeDate: null,
        pickupWindowEnd: hours(10),
      })
      mockPrisma.donation.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.donation.findUniqueOrThrow.mockResolvedValue({ id: 'don1', status: DonationStatus.RESERVADA })
    }

    it('receptor reserva: troca o estado de forma condicional, grava o evento e notifica', async () => {
      givenReservable()

      const result = await service.reserve('don1', recipientUser)

      expect(mockPrisma.donation.updateMany).toHaveBeenCalledWith({
        where: { id: 'don1', status: DonationStatus.DISPONIVEL },
        data: expect.objectContaining({ status: DonationStatus.RESERVADA, recipientId: 'r1', matchedAt: expect.any(Date) }),
      })
      expect(mockPrisma.donationEvent.create).toHaveBeenCalledWith({
        data: {
          donationId: 'don1',
          action: DonationAction.RESERVADA,
          fromStatus: DonationStatus.DISPONIVEL,
          toStatus: DonationStatus.RESERVADA,
          actorId: recipientUser.id,
        },
      })
      expect(notify).toHaveBeenCalledWith(DonationAction.RESERVADA, 'don1', recipientUser.id)
      expect(result.status).toBe(DonationStatus.RESERVADA)
    })

    it('conflito: se outra pessoa reservou primeiro, falha sem gravar evento nem notificar', async () => {
      givenReservable()
      mockPrisma.donation.updateMany.mockResolvedValue({ count: 0 })

      await expect(service.reserve('don1', recipientUser)).rejects.toThrow(ConflictError)
      expect(mockPrisma.donationEvent.create).not.toHaveBeenCalled()
      expect(notify).not.toHaveBeenCalled()
    })

    it('não reserva doação com prazo encerrado', async () => {
      givenReservable()
      mockPrisma.donation.findUnique.mockResolvedValue({
        id: 'don1',
        status: DonationStatus.DISPONIVEL,
        bestBeforeDate: null,
        pickupWindowEnd: hours(-1),
      })
      await expect(service.reserve('don1', recipientUser)).rejects.toThrow(/prazo/)
      expect(mockPrisma.donation.updateMany).not.toHaveBeenCalled()
    })

    it('só receptor reserva (doador e admin não)', async () => {
      await expect(service.reserve('don1', donorUser)).rejects.toThrow(ForbiddenError)
      await expect(service.reserve('don1', admin)).rejects.toThrow(ForbiddenError)
    })

    it('receptor sem cadastro ativo é rejeitado', async () => {
      mockPrisma.recipient.findUnique.mockResolvedValue({ id: 'r1', active: false })
      await expect(service.reserve('don1', recipientUser)).rejects.toThrow(ForbiddenError)
    })

    it('doação inexistente', async () => {
      mockPrisma.recipient.findUnique.mockResolvedValue({ id: 'r1', active: true })
      mockPrisma.donation.findUnique.mockResolvedValue(null)
      await expect(service.reserve('x', recipientUser)).rejects.toThrow(NotFoundError)
    })
  })

  describe('release', () => {
    function givenReserved(recipientId = 'r1') {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', recipientId, status: DonationStatus.RESERVADA })
      mockPrisma.recipient.findUnique.mockResolvedValue({ id: 'r1' })
      mockPrisma.donation.updateMany.mockResolvedValue({ count: 1 })
      mockPrisma.donation.findUniqueOrThrow.mockResolvedValue({ id: 'don1', status: DonationStatus.DISPONIVEL })
    }

    it('receptor dono libera: volta a DISPONÍVEL sem receptor, grava LIBERADA e notifica', async () => {
      givenReserved()

      await service.release('don1', recipientUser)

      expect(mockPrisma.donation.updateMany).toHaveBeenCalledWith({
        where: { id: 'don1', status: DonationStatus.RESERVADA, routeId: null },
        data: { status: DonationStatus.DISPONIVEL, recipientId: null, matchedAt: null },
      })
      expect(mockPrisma.donationEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ action: DonationAction.LIBERADA, toStatus: DonationStatus.DISPONIVEL }),
      })
      expect(notify).toHaveBeenCalledWith(DonationAction.LIBERADA, 'don1', recipientUser.id)
    })

    it('outro receptor não pode liberar a reserva alheia', async () => {
      givenReserved('r-outro')
      await expect(service.release('don1', recipientUser)).rejects.toThrow(ForbiddenError)
      expect(mockPrisma.donation.updateMany).not.toHaveBeenCalled()
    })

    it('administrador pode liberar', async () => {
      givenReserved()
      await service.release('don1', admin)
      expect(mockPrisma.donation.updateMany).toHaveBeenCalled()
    })

    it('não libera quando já está em rota ou fora de reservada (nenhuma linha atualizada)', async () => {
      givenReserved()
      mockPrisma.donation.updateMany.mockResolvedValue({ count: 0 })
      await expect(service.release('don1', recipientUser)).rejects.toThrow(ValidationError)
      expect(mockPrisma.donationEvent.create).not.toHaveBeenCalled()
    })
  })

  describe('notificações', () => {
    it('criar uma doação dispara o aviso CRIADA com o autor da ação', async () => {
      mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd1', active: true })
      mockPrisma.donation.create.mockResolvedValue({ id: 'don1' })
      await service.create(baseInput, donorUser)
      expect(notify).toHaveBeenCalledWith(DonationAction.CRIADA, 'don1', donorUser.id)
    })
  })

  describe('getReceipt', () => {
    const coletada = (over: Record<string, unknown> = {}) => ({
      id: 'cl9x8y7z6abcd1234',
      donorId: 'd1',
      description: 'Marmitas',
      category: FoodCategory.PREPARADO,
      storageCondition: StorageCondition.REFRIGERADO,
      estimatedQuantityKg: '35',
      collectedQuantityKg: '32',
      status: DonationStatus.ENTREGUE,
      bestBeforeDate: null,
      termsAcceptedAt: new Date('2026-10-01T10:00:00Z'),
      createdAt: new Date('2026-10-01T10:00:00Z'),
      collectedAt: new Date('2026-10-02T10:00:00Z'),
      confirmedAt: new Date('2026-10-02T12:00:00Z'),
      donor: { name: 'Restaurante', document: '11.222.333/0001-44', address: 'Rua A, 1', city: 'Sorocaba', state: 'SP' },
      recipient: { name: 'ONG', document: null, address: null, city: 'Votorantim', state: null },
      ...over,
    })

    it('administrador emite o comprovante com partes, quantidades e datas', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue(coletada())

      const receipt = await service.getReceipt('x', admin)

      expect(receipt.number).toBe('CF-ABCD1234')
      expect(receipt.number).toMatch(/^CF-[A-Z0-9]{8}$/)
      expect(receipt.donor).toEqual({ name: 'Restaurante', document: '11.222.333/0001-44', address: 'Rua A, 1, Sorocaba, SP' })
      expect(receipt.recipient).toEqual({ name: 'ONG', document: null, address: 'Votorantim' })
      expect(receipt.donation).toMatchObject({ estimatedQuantityKg: 35, collectedQuantityKg: 32, storageCondition: 'REFRIGERADO' })
    })

    it('doador dono emite; outro doador não', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue(coletada())
      mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd1' })
      await expect(service.getReceipt('x', donorUser)).resolves.toBeTruthy()

      mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd2' })
      await expect(service.getReceipt('x', otherDonorUser)).rejects.toThrow(ForbiddenError)
    })

    it('receptor não emite comprovante', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue(coletada())
      await expect(service.getReceipt('x', recipientUser)).rejects.toThrow(ForbiddenError)
    })

    it.each([DonationStatus.DISPONIVEL, DonationStatus.RESERVADA, DonationStatus.AGENDADA, DonationStatus.CANCELADA, DonationStatus.VENCIDA])(
      'não emite para doação %s (ainda não coletada)',
      async (status) => {
        mockPrisma.donation.findUnique.mockResolvedValue(coletada({ status }))
        await expect(service.getReceipt('x', admin)).rejects.toThrow(/depois que a doação for coletada/)
      },
    )

    it('COLETADA (ainda não confirmada) já tem comprovante, com quantidade coletada', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue(coletada({ status: DonationStatus.COLETADA, confirmedAt: null }))
      const receipt = await service.getReceipt('x', admin)
      expect(receipt.donation.confirmedAt).toBeNull()
    })

    it('doação inexistente', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue(null)
      await expect(service.getReceipt('x', admin)).rejects.toThrow(NotFoundError)
    })
  })

  describe('findEvents', () => {
    it('dono DOADOR vê o histórico da própria doação', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', donorId: 'd1', recipientId: null })
      mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd1' })
      mockPrisma.donationEvent.findMany.mockResolvedValue([{ id: 'e1' }])

      const events = await service.findEvents('don1', donorUser)

      expect(events).toEqual([{ id: 'e1' }])
      expect(mockPrisma.donationEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { donationId: 'don1' }, orderBy: { createdAt: 'asc' } }),
      )
    })

    it('outro doador não vê o histórico', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', donorId: 'd1', recipientId: null })
      mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd2' })
      await expect(service.findEvents('don1', otherDonorUser)).rejects.toThrow(ForbiddenError)
      expect(mockPrisma.donationEvent.findMany).not.toHaveBeenCalled()
    })

    it('lança NotFoundError pra doação inexistente', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue(null)
      await expect(service.findEvents('x', admin)).rejects.toThrow(NotFoundError)
    })
  })

  describe('findById', () => {
    it('lança NotFoundError pra id inexistente', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue(null)
      await expect(service.findById('inexistente', admin)).rejects.toThrow(NotFoundError)
    })

    it('DOADOR não acessa doação de outro doador', async () => {
      mockPrisma.donation.findUnique.mockResolvedValue({ id: 'don1', donorId: 'd1', recipientId: null })
      mockPrisma.donor.findUnique.mockResolvedValue({ id: 'd2' })
      await expect(service.findById('don1', otherDonorUser)).rejects.toThrow(ForbiddenError)
    })
  })
})
