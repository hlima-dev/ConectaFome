import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { Dashboard } from '../src/pages/Dashboard'

const getStoredUser = vi.hoisted(() => vi.fn())
const useReportSummary = vi.hoisted(() => vi.fn())
const useSeries = vi.hoisted(() => vi.fn())

vi.mock('../src/services/auth', () => ({ getStoredUser }))
vi.mock('../src/hooks/useReports', () => ({ useReportSummary, useSeries }))
// O gráfico de kg tem testes próprios (KgChart.test); aqui só importa que o painel o monte com o período certo.
vi.mock('../src/components/reports/KgChart', () => ({ KgChart: (props: { mode: string; compact?: boolean }) => <div data-testid="kg-chart" data-mode={props.mode} data-compact={String(!!props.compact)} /> }))
// A fila de pendências e os primeiros passos têm testes próprios; aqui só importa se aparecem.
vi.mock('../src/components/PendingPanel', () => ({ PendingPanel: () => <div data-testid="pending-panel" /> }))
vi.mock('../src/components/GettingStarted', () => ({ GettingStarted: ({ role }: { role?: string }) => <div data-testid="getting-started">{role}</div> }))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PieChart: () => <div data-testid="pie-chart" />, Pie: () => null, Cell: () => null,
}))

const summary = {
  totalKgRescued: 248, totalDonationsRescued: 12, deliveredDonations: 9, completedRoutes: 4, activeDonors: 7, activeRecipients: 5,
  donationsByStatus: { ENTREGUE: 6, DISPONIVEL: 3, VENCIDA: 1 },
}

const renderDashboard = () => render(<MemoryRouter><Dashboard /></MemoryRouter>)

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useSeries.mockReturnValue({ data: { from: '2026-01-01', to: '2026-12-31', granularity: 'month', totalKg: 32, donationCount: 1, points: [] }, isLoading: false })
  })

  describe('administrador', () => {
    beforeEach(() => {
      getStoredUser.mockReturnValue({ name: 'Admin', role: 'ADMIN' })
      useReportSummary.mockReturnValue({ data: summary, isLoading: false })
    })

    it('mostra a fila de pendências e não os primeiros passos', () => {
      renderDashboard()
      expect(screen.getByTestId('pending-panel')).toBeInTheDocument()
      expect(screen.queryByTestId('getting-started')).not.toBeInTheDocument()
    })

    it('mostra os seis indicadores e os dois gráficos', () => {
      renderDashboard()
      expect(screen.getByRole('heading', { name: /dashboard administrativo/i })).toBeInTheDocument()
      expect(screen.getByText('248 kg')).toBeInTheDocument()
      expect(screen.getByText('Doadores ativos')).toBeInTheDocument()
      expect(screen.getByText('Receptores ativos')).toBeInTheDocument()
      expect(screen.getByTestId('kg-chart')).toBeInTheDocument()
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    })

    it('a legenda do gráfico de status traz a contagem e o percentual, só dos estados com doações', () => {
      renderDashboard()
      expect(screen.getByText('Entregue')).toBeInTheDocument()
      expect(screen.getByText('(60%)')).toBeInTheDocument() // 6 de 10
      expect(screen.getByText('(10%)')).toBeInTheDocument()
      expect(screen.queryByText('Cancelada')).not.toBeInTheDocument()
    })

    it('o gráfico de kg abre no ano, na versão compacta, e consulta por mês', () => {
      renderDashboard()
      expect(screen.getByTestId('kg-chart')).toHaveAttribute('data-mode', 'ano')
      expect(screen.getByTestId('kg-chart')).toHaveAttribute('data-compact', 'true')
      const year = new Date().getFullYear()
      expect(useSeries).toHaveBeenLastCalledWith({ from: `${year}-01-01`, to: `${year}-12-31`, granularity: 'month' })
    })

    it('troca para semana e mês e anda para o período anterior', async () => {
      const user = userEvent.setup()
      renderDashboard()
      await user.click(screen.getByRole('radio', { name: 'Semana' }))
      expect(screen.getByTestId('kg-chart')).toHaveAttribute('data-mode', 'semana')
      expect(useSeries.mock.lastCall![0]).toMatchObject({ granularity: 'day' })

      const before = useSeries.mock.lastCall![0].from
      await user.click(screen.getByRole('button', { name: 'Período anterior' }))
      expect(useSeries.mock.lastCall![0].from < before).toBe(true)
      // sem filtros de doador/receptor, comparação nem datas livres: isso é nos Relatórios
      expect(screen.queryByRole('radio', { name: 'Personalizado' })).not.toBeInTheDocument()
    })

    it('sem doações, o gráfico de status também explica', () => {
      useReportSummary.mockReturnValue({ data: { ...summary, donationsByStatus: {} }, isLoading: false })
      renderDashboard()
      expect(screen.getByText(/nenhuma doação registrada ainda/i)).toBeInTheDocument()
    })

    it('tem o atalho para o relatório completo', () => {
      renderDashboard()
      expect(screen.getByRole('link', { name: /ver relatório completo/i })).toHaveAttribute('href', '/relatorios')
    })
  })

  it('receptor é levado às oportunidades e às suas doações (sem indicadores de administração)', () => {
    getStoredUser.mockReturnValue({ name: 'ONG', role: 'RECEPTOR' })
    useReportSummary.mockReturnValue({ data: undefined, isLoading: false })
    renderDashboard()
    expect(screen.getByRole('link', { name: 'Oportunidades' })).toHaveAttribute('href', '/oportunidades')
    expect(screen.getByRole('link', { name: 'Doações' })).toHaveAttribute('href', '/doacoes')
    expect(screen.queryByTestId('pie-chart')).not.toBeInTheDocument()
    expect(screen.queryByTestId('kg-chart')).not.toBeInTheDocument()
    expect(useSeries).toHaveBeenLastCalledWith(null) // só a administração consulta a série
  })

  it('doador só vê o caminho para as suas doações', () => {
    getStoredUser.mockReturnValue({ name: 'Mercado', role: 'DOADOR' })
    useReportSummary.mockReturnValue({ data: undefined, isLoading: false })
    renderDashboard()
    expect(screen.getByRole('link', { name: 'Doações' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Oportunidades' })).not.toBeInTheDocument()
  })
})
