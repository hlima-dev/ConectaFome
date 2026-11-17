import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ReportsPage } from '../src/pages/reports/ReportsPage'
import { rangeFor, toDay } from '../src/utils/period'

const useRates = vi.hoisted(() => vi.fn())
const useSeries = vi.hoisted(() => vi.fn())
const useByDonor = vi.hoisted(() => vi.fn())
const downloadCsv = vi.hoisted(() => vi.fn())

vi.mock('../src/hooks/useReports', () => ({ useRates, useSeries, useByDonor, useByRecipient: () => ({ data: [], isLoading: false }) }))
vi.mock('../src/hooks/useDonors', () => ({ useDonors: () => ({ data: [{ id: 'd1', name: 'Padaria Central' }, { id: 'd2', name: 'Mercado Bom Preço' }] }) }))
vi.mock('../src/hooks/useRecipients', () => ({ useRecipients: () => ({ data: [{ id: 'r1', name: 'ONG Mesa' }] }) }))
vi.mock('../src/services/reports', () => ({ downloadDonationsCsv: downloadCsv }))
vi.mock('recharts', () => {
  const Null = () => null
  return { ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>, ComposedChart: Null, Area: Null, Bar: Null, Cell: Null, Line: Null, CartesianGrid: Null, ReferenceLine: Null, Tooltip: Null, XAxis: Null, YAxis: Null }
})

const rates = {
  registered: 10, rescued: 6, delivered: 4, expired: 2, canceled: 1,
  rescueRate: 0.6, lossRate: 0.2, deliveryRate: 0.667, rescuedKg: 100.5, lostKg: 15.5, avgHoursToCollect: 18.3, peopleServed: 126,
}
const series = (totalKg = 100) => ({ from: '2026-01-01', to: '2026-12-31', granularity: 'month', totalKg, donationCount: 4, points: [{ start: '2026-10-01', totalKg, donationCount: 4 }] })

const today = new Date()
const indicators = () => within(screen.getByRole('region', { name: /indicadores do período/i }))
const lastSeriesArgs = () => useSeries.mock.calls.map((c) => c[0]).filter(Boolean)

describe('ReportsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useRates.mockReturnValue({ data: rates })
    useSeries.mockReturnValue({ data: series(), isLoading: false })
    useByDonor.mockReturnValue({ data: [], isLoading: false })
  })

  describe('indicadores do período', () => {
    it('mostra as taxas, o kg resgatado, o tempo até a coleta e as pessoas atendidas', () => {
      render(<ReportsPage />)
      const k = indicators()
      expect(k.getByText('60%')).toBeInTheDocument()
      expect(k.getByText('20%')).toBeInTheDocument()
      expect(k.getByText('66,7%')).toBeInTheDocument()
      expect(k.getByText('100,5 kg')).toBeInTheDocument()
      expect(k.getByText('18,3 h')).toBeInTheDocument()
      expect(k.getByText('126')).toBeInTheDocument()
      expect(k.getByText(/2 vencidas · 15,5 kg/)).toBeInTheDocument()
    })

    it('taxas sem base de cálculo aparecem como traço, não como 0%', () => {
      useRates.mockReturnValue({ data: { ...rates, rescueRate: null, lossRate: null, deliveryRate: null, avgHoursToCollect: null } })
      render(<ReportsPage />)
      expect(indicators().getAllByText('—').length).toBeGreaterThanOrEqual(4)
      expect(indicators().queryByText('0%')).not.toBeInTheDocument()
    })

    it('explica por que os totais do gráfico e dos indicadores podem diferir', () => {
      render(<ReportsPage />)
      expect(indicators().getByText(/data da coleta/)).toBeInTheDocument()
    })
  })

  describe('período', () => {
    it('abre no ano atual, com o gráfico por mês', () => {
      render(<ReportsPage />)
      const year = rangeFor('ano', today)
      expect(screen.getByRole('radio', { name: 'Ano' })).toHaveAttribute('aria-checked', 'true')
      expect(lastSeriesArgs()).toContainEqual(expect.objectContaining({ from: year.from, to: year.to, granularity: 'month' }))
      expect(useRates).toHaveBeenLastCalledWith({ from: year.from, to: year.to })
    })

    it('semana: de segunda a domingo, gráfico por dia, e os indicadores seguem o mesmo período', async () => {
      const user = userEvent.setup()
      render(<ReportsPage />)
      await user.click(screen.getByRole('radio', { name: 'Semana' }))

      const week = rangeFor('semana', today)
      expect(lastSeriesArgs()).toContainEqual(expect.objectContaining({ from: week.from, to: week.to, granularity: 'day' }))
      expect(useRates).toHaveBeenLastCalledWith({ from: week.from, to: week.to })
      expect(useByDonor).toHaveBeenLastCalledWith({ from: week.from, to: week.to })
    })

    it('mês: as setas andam para o mês anterior e voltam, e "próximo" fica desligado no mês atual', async () => {
      const user = userEvent.setup()
      render(<ReportsPage />)
      await user.click(screen.getByRole('radio', { name: 'Mês' }))
      expect(screen.getByRole('button', { name: 'Próximo período' })).toBeDisabled()

      await user.click(screen.getByRole('button', { name: 'Período anterior' }))
      const prevMonth = rangeFor('mes', new Date(today.getFullYear(), today.getMonth() - 1, 1))
      expect(lastSeriesArgs()).toContainEqual(expect.objectContaining({ from: prevMonth.from, to: prevMonth.to, granularity: 'day' }))
      expect(screen.getByRole('button', { name: 'Próximo período' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Voltar para hoje' })).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: 'Voltar para hoje' }))
      expect(lastSeriesArgs()).toContainEqual(expect.objectContaining({ from: rangeFor('mes', today).from }))
      expect(screen.queryByRole('button', { name: 'Voltar para hoje' })).not.toBeInTheDocument()
    })

    it('personalizado: escolhe as datas e a escala se ajusta ao tamanho do intervalo', async () => {
      const user = userEvent.setup()
      render(<ReportsPage />)
      await user.click(screen.getByRole('radio', { name: 'Personalizado' }))
      fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-01-01' } })
      fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-03-31' } })

      expect(lastSeriesArgs()).toContainEqual(expect.objectContaining({ from: '2026-01-01', to: '2026-03-31', granularity: 'week' }))
      expect(useRates).toHaveBeenLastCalledWith({ from: '2026-01-01', to: '2026-03-31' })
    })

    it('os atalhos "Últimos 7 dias" preenchem o intervalo terminando hoje', async () => {
      const user = userEvent.setup()
      render(<ReportsPage />)
      await user.click(screen.getByRole('radio', { name: 'Personalizado' }))
      await user.click(screen.getByRole('button', { name: 'Últimos 7 dias' }))
      const to = toDay(today)
      const from = toDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6))
      expect(lastSeriesArgs()).toContainEqual(expect.objectContaining({ from, to, granularity: 'day' }))
    })

    it('data inicial depois da final: avisa e não consulta nada', async () => {
      const user = userEvent.setup()
      render(<ReportsPage />)
      await user.click(screen.getByRole('radio', { name: 'Personalizado' }))
      fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-12-01' } })
      fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-11-01' } })

      expect(screen.getByRole('alert')).toHaveTextContent('A data inicial não pode ser depois da final')
      expect(useSeries).toHaveBeenLastCalledWith(null)
      expect(useRates).toHaveBeenLastCalledWith(undefined)
      expect(screen.getByRole('button', { name: /exportar csv/i })).toBeDisabled()
    })
  })

  describe('comparação e filtros', () => {
    it('a comparação com o período anterior pode ser desligada', async () => {
      const user = userEvent.setup()
      render(<ReportsPage />)
      const year = rangeFor('ano', today)
      const prevYear = rangeFor('ano', new Date(today.getFullYear() - 1, 0, 1))
      expect(lastSeriesArgs()).toContainEqual(expect.objectContaining({ from: prevYear.from, to: prevYear.to }))

      await user.click(screen.getByRole('switch', { name: /comparar com o período anterior/i }))
      expect(screen.getByRole('switch', { name: /comparar/i })).toHaveAttribute('aria-checked', 'false')
      expect(useSeries).toHaveBeenLastCalledWith(null) // a consulta do período anterior sai de cena
      expect(useSeries.mock.calls.at(-2)![0]).toMatchObject({ from: year.from, to: year.to })
    })

    it('filtra por doador e receptor e permite limpar', async () => {
      const user = userEvent.setup()
      render(<ReportsPage />)
      await user.selectOptions(screen.getByLabelText('Doador'), 'd1')
      await user.selectOptions(screen.getByLabelText('Receptor'), 'r1')
      expect(lastSeriesArgs()).toContainEqual(expect.objectContaining({ donorId: 'd1', recipientId: 'r1' }))

      await user.click(screen.getByRole('button', { name: /limpar filtros/i }))
      expect(screen.getByLabelText('Doador')).toHaveValue('')
      expect(lastSeriesArgs().at(-1)).not.toHaveProperty('donorId', 'd1')
    })
  })

  describe('exportação', () => {
    it('exporta o período escolhido', async () => {
      const user = userEvent.setup()
      downloadCsv.mockResolvedValue(undefined)
      render(<ReportsPage />)
      await user.click(screen.getByRole('radio', { name: 'Semana' }))
      await user.click(screen.getByRole('button', { name: /exportar csv/i }))
      const week = rangeFor('semana', today)
      expect(downloadCsv).toHaveBeenCalledWith({ from: week.from, to: week.to })
    })

    it('mostra o erro se a exportação falhar', async () => {
      const user = userEvent.setup()
      downloadCsv.mockRejectedValue(new Error('sem rede'))
      render(<ReportsPage />)
      await user.click(screen.getByRole('button', { name: /exportar csv/i }))
      expect(await screen.findByRole('alert')).toBeInTheDocument()
    })
  })
})
