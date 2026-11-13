import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { Dashboard } from '../src/pages/Dashboard'

const getStoredUser = vi.hoisted(() => vi.fn())
const useReportSummary = vi.hoisted(() => vi.fn())
const useMonthlyKg = vi.hoisted(() => vi.fn())

vi.mock('../src/services/auth', () => ({ getStoredUser }))
vi.mock('../src/hooks/useReports', () => ({ useReportSummary, useMonthlyKg }))
// A fila de pendências e os primeiros passos têm testes próprios; aqui só importa se aparecem.
vi.mock('../src/components/PendingPanel', () => ({ PendingPanel: () => <div data-testid="pending-panel" /> }))
vi.mock('../src/components/GettingStarted', () => ({ GettingStarted: ({ role }: { role?: string }) => <div data-testid="getting-started">{role}</div> }))
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  BarChart: () => <div data-testid="bar-chart" />, Bar: () => null, CartesianGrid: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null,
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
    useMonthlyKg.mockReturnValue({ data: [{ month: '2026-10-01T00:00:00Z', totalKg: 32, donationCount: 1 }] })
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
      expect(screen.getByTestId('bar-chart')).toBeInTheDocument()
      expect(screen.getByTestId('pie-chart')).toBeInTheDocument()
    })

    it('a legenda do gráfico de status traz a contagem e o percentual, só dos estados com doações', () => {
      renderDashboard()
      expect(screen.getByText('Entregue')).toBeInTheDocument()
      expect(screen.getByText('(60%)')).toBeInTheDocument() // 6 de 10
      expect(screen.getByText('(10%)')).toBeInTheDocument()
      expect(screen.queryByText('Cancelada')).not.toBeInTheDocument()
    })

    it('sem doações resgatadas no ano, explica em vez de mostrar um gráfico vazio', () => {
      useMonthlyKg.mockReturnValue({ data: [] })
      renderDashboard()
      expect(screen.getByText(/nenhuma doação resgatada neste ano/i)).toBeInTheDocument()
      expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument()
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
  })

  it('doador só vê o caminho para as suas doações', () => {
    getStoredUser.mockReturnValue({ name: 'Mercado', role: 'DOADOR' })
    useReportSummary.mockReturnValue({ data: undefined, isLoading: false })
    renderDashboard()
    expect(screen.getByRole('link', { name: 'Doações' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Oportunidades' })).not.toBeInTheDocument()
  })
})
