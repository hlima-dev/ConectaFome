import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PickupRouteDetailPage } from '../src/pages/logistics/PickupRouteDetailPage'

const usePickupRoute = vi.hoisted(() => vi.fn())
const completeAsync = vi.hoisted(() => vi.fn())
const startAsync = vi.hoisted(() => vi.fn())
const idle = { mutateAsync: vi.fn(), isPending: false }

vi.mock('../src/hooks/usePickupRoutes', () => ({
  usePickupRoute,
  useAttachDonation: () => idle,
  useDetachDonation: () => idle,
  useCancelRoute: () => idle,
  useCollectStop: () => idle,
  useFailStop: () => idle,
  useStartRoute: () => ({ mutateAsync: startAsync, isPending: false }),
  useCompleteRoute: () => ({ mutateAsync: completeAsync, isPending: false }),
}))
vi.mock('../src/hooks/useDonations', () => ({ useDonations: () => ({ data: [] }) }))
vi.mock('../src/components/RouteMap', () => ({ RouteMap: () => <div data-testid="route-map" /> }))

const donation = (id: string, description: string, kg: string) => ({
  id,
  description,
  status: 'AGENDADA',
  estimatedQuantityKg: kg,
  collectedQuantityKg: null,
  donor: { name: 'Padaria' },
  recipient: { name: 'ONG' },
})

const route = (over: Record<string, unknown> = {}) => ({
  id: 'r1',
  routeNumber: 7,
  status: 'PLANEJADA',
  vehicle: { plate: 'ABC1D23', model: 'Fiorino' },
  volunteer: { name: 'Zé' },
  scheduledFor: '2026-11-05T10:00:00Z',
  departedAt: null,
  completedAt: null,
  canceledAt: null,
  notes: null,
  donations: [donation('d1', 'Pães', '10'), donation('d2', 'Frutas', '5')],
  load: { totalKg: 15, capacityKg: 100, exceeds: false, remainingKg: 85 },
  plan: { stops: [], totalKm: 0, unlocated: [], recipients: [] },
  ...over,
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/rotas/r1']}>
      <Routes>
        <Route path="/rotas/:id" element={<PickupRouteDetailPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('PickupRouteDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    usePickupRoute.mockReturnValue({ data: route(), isLoading: false })
  })

  it('mostra o painel de carga e percurso', () => {
    renderPage()
    expect(screen.getByText('Carga e percurso')).toBeInTheDocument()
    expect(screen.getByText(/Carga estimada:/)).toBeInTheDocument()
  })

  it('"Iniciar rota" fica desabilitado quando a carga passa da capacidade', () => {
    usePickupRoute.mockReturnValue({ data: route({ load: { totalKg: 130, capacityKg: 100, exceeds: true, remainingKg: -30 } }), isLoading: false })
    renderPage()
    expect(screen.getByRole('button', { name: /iniciar rota/i })).toBeDisabled()
  })

  it('"Iniciar rota" fica habilitado dentro da capacidade', async () => {
    const user = userEvent.setup()
    startAsync.mockResolvedValue({})
    renderPage()
    const button = screen.getByRole('button', { name: /iniciar rota/i })
    expect(button).toBeEnabled()
    await user.click(button)
    expect(startAsync).toHaveBeenCalled()
  })

  describe('rota em andamento', () => {
    beforeEach(() => {
      usePickupRoute.mockReturnValue({ data: route({ status: 'EM_ANDAMENTO' }), isLoading: false })
    })

    it('mostra um campo de kg coletado por doação, com a estimada como sugestão', () => {
      renderPage()
      expect(screen.getByLabelText('Kg coletado de Pães')).toHaveAttribute('placeholder', '10')
      expect(screen.getByLabelText('Kg coletado de Frutas')).toHaveAttribute('placeholder', '5')
    })

    it('concluir sem digitar nada não envia quantidades (vale a estimada)', async () => {
      const user = userEvent.setup()
      completeAsync.mockResolvedValue({})
      renderPage()
      await user.click(screen.getByRole('button', { name: /concluir rota/i }))
      expect(completeAsync).toHaveBeenCalledWith(undefined)
    })

    it('envia só as quantidades corrigidas e válidas', async () => {
      const user = userEvent.setup()
      completeAsync.mockResolvedValue({})
      renderPage()

      await user.type(screen.getByLabelText('Kg coletado de Pães'), '8.5')
      await user.type(screen.getByLabelText('Kg coletado de Frutas'), '0') // inválido: ignorado
      await user.click(screen.getByRole('button', { name: /concluir rota/i }))

      expect(completeAsync).toHaveBeenCalledWith([{ donationId: 'd1', collectedQuantityKg: 8.5 }])
    })
  })

  it('rota concluída mostra o kg coletado, não campos de edição', () => {
    usePickupRoute.mockReturnValue({
      data: route({ status: 'CONCLUIDA', donations: [{ ...donation('d1', 'Pães', '10'), collectedQuantityKg: '8.5', status: 'COLETADA' }] }),
      isLoading: false,
    })
    renderPage()
    expect(screen.getByText('8,5 kg')).toBeInTheDocument()
    expect(screen.queryByLabelText(/Kg coletado de/)).not.toBeInTheDocument()
  })
})

describe('PickupRouteDetailPage — paradas', () => {
  beforeEach(() => vi.clearAllMocks())

  const renderOngoing = (data: Record<string, unknown>) => {
    usePickupRoute.mockReturnValue({ data: route({ status: 'EM_ANDAMENTO', ...data }), isLoading: false })
    return render(
      <MemoryRouter initialEntries={['/rotas/r1']}>
        <Routes>
          <Route path="/rotas/:id" element={<PickupRouteDetailPage />} />
        </Routes>
      </MemoryRouter>,
    )
  }

  it('rota em andamento oferece "Coletada" e "Não coletada" por parada aberta', () => {
    renderOngoing({ donations: [donation('d1', 'Pães', '10'), { ...donation('d2', 'Leite', '5'), status: 'COLETADA' }] })
    expect(screen.getAllByRole('button', { name: 'Coletada' })).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Não coletada' })).toHaveLength(1)
    expect(screen.getByText('Resolvida')).toBeInTheDocument()
  })

  it('"Não coletada" abre o motivo e explica o que acontece com a doação', async () => {
    const user = userEvent.setup()
    renderOngoing({ donations: [donation('d1', 'Pães', '10')] })
    await user.click(screen.getByRole('button', { name: 'Não coletada' }))

    expect(await screen.findByText('Coleta não realizada')).toBeInTheDocument()
    expect(screen.getByText(/volta a ficar reservada/)).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('O que aconteceu?'), 'PRODUTO_IMPROPRIO')
    expect(screen.getByText(/será cancelada/)).toBeInTheDocument()
  })

  it('mostra as paradas não realizadas com o motivo', () => {
    renderOngoing({
      donations: [donation('d1', 'Pães', '10')],
      failedDonations: [{ ...donation('d9', 'Iogurte', '3'), status: 'RESERVADA', routeId: null, pickupFailureReason: 'DOADOR_AUSENTE', pickupFailureNote: 'portão fechado' }],
    })
    expect(screen.getByText('Paradas não realizadas (1)')).toBeInTheDocument()
    expect(screen.getByText(/Doador ausente — portão fechado/)).toBeInTheDocument()
  })
})
