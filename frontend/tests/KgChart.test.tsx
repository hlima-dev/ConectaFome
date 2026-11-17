import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KgChart } from '../src/components/reports/KgChart'

vi.mock('recharts', () => {
  const Null = () => null
  return { ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart">{children}</div>, ComposedChart: Null, Area: Null, Bar: Null, Cell: Null, Line: Null, CartesianGrid: Null, ReferenceLine: Null, Tooltip: Null, XAxis: Null, YAxis: Null }
})

const NOW = new Date(2026, 10, 12) // 12/11/2026 (quinta)
const week = (kg: number[], from = '2026-11-09') => ({
  from, to: '2026-11-15', granularity: 'day' as const,
  totalKg: kg.reduce((a, b) => a + b, 0), donationCount: kg.filter((k) => k > 0).length,
  points: kg.map((totalKg, i) => ({ start: `2026-11-${String(9 + i).padStart(2, '0')}`, totalKg, donationCount: totalKg > 0 ? 1 : 0 })),
})

// Cartão de resumo pelo título (o mesmo texto também aparece na tabela de dados).
const tile = (label: string) => screen.getAllByText(label).map((e) => e.closest('.fade-up')).find(Boolean) as HTMLElement

const renderChart = (props: Partial<React.ComponentProps<typeof KgChart>> = {}) =>
  render(<KgChart series={week([10, 40, 0, 20, 0, 0, 0])} previous={week([20, 20, 20, 20, 0, 0, 0], '2026-11-02')} mode="semana" loading={false} compare today={NOW} {...props} />)

describe('KgChart', () => {
  it('resume o período: total, média só dos dias que já passaram, melhor dia e nº de coletas', () => {
    renderChart()
    expect(within(tile('Kg resgatado')).getByLabelText('70 kg')).toBeInTheDocument()
    // hoje é quinta (12/11): 4 dias passaram → 70 / 4 = 17,5
    expect(within(tile('Média por dia')).getByText('17,5 kg')).toBeInTheDocument()
    expect(screen.getByText('considera 4 dias')).toBeInTheDocument()
    // melhor dia: terça 10/11 com 40 kg
    expect(within(tile('Melhor dia')).getByText('40 kg')).toBeInTheDocument()
    expect(within(tile('Melhor dia')).getByText('Terça-feira, 10 de novembro de 2026')).toBeInTheDocument()
    expect(screen.getByText('3 de 7 dias com coleta')).toBeInTheDocument()
  })

  it('compara com o período anterior: queda em vermelho com a porcentagem', () => {
    renderChart({ previous: week([25, 25, 25, 25, 0, 0, 0], '2026-11-02') }) // 70 vs 100: queda de 30%
    expect(within(tile('Kg resgatado')).getByText('30%')).toBeInTheDocument()
    expect(screen.getByText(/vs\. 100 kg no período anterior/)).toBeInTheDocument()
  })

  it('crescimento aparece como alta', () => {
    renderChart({ previous: week([10, 10, 10, 10, 0, 0, 0], '2026-11-02') }) // 70 vs 40
    expect(within(tile('Kg resgatado')).getByText('75%')).toBeInTheDocument()
  })

  it('sem comparação, o resumo não mostra o período anterior', () => {
    renderChart({ compare: false, previous: undefined })
    expect(screen.queryByText(/no período anterior/)).not.toBeInTheDocument()
    expect(screen.queryByText('Período anterior')).not.toBeInTheDocument()
  })

  it('período anterior sem coletas não inventa porcentagem', () => {
    renderChart({ previous: week([0, 0, 0, 0, 0, 0, 0], '2026-11-02') })
    expect(screen.getByText('Sem coletas no período anterior')).toBeInTheDocument()
  })

  it('período sem nenhuma coleta mostra uma mensagem amigável em vez de um gráfico vazio', () => {
    renderChart({ series: week([0, 0, 0, 0, 0, 0, 0]), previous: undefined, compare: false })
    expect(screen.getByText('Nenhuma coleta neste período')).toBeInTheDocument()
    expect(screen.queryByTestId('chart')).not.toBeInTheDocument()
  })

  it('tem alternativa em texto: descrição do gráfico e tabela com os dados', async () => {
    const user = userEvent.setup()
    renderChart()
    expect(screen.getByRole('img', { name: /total de 70 kg, melhor dia com 40 kg/i })).toBeInTheDocument()
    await user.click(screen.getByText('Ver os dados em tabela'))
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('row')).toHaveLength(8) // cabeçalho + 7 dias
    expect(within(table).getByText('Terça-feira, 10 de novembro de 2026')).toBeInTheDocument()
  })

  it('troca entre barras e área', async () => {
    const user = userEvent.setup()
    renderChart()
    expect(screen.getByRole('radio', { name: 'Barras' })).toHaveAttribute('aria-checked', 'true')
    await user.click(screen.getByRole('radio', { name: 'Área' }))
    expect(screen.getByRole('radio', { name: 'Área' })).toHaveAttribute('aria-checked', 'true')
  })

  it('carregando pela primeira vez mostra o esqueleto', () => {
    renderChart({ series: undefined, previous: undefined, loading: true })
    expect(screen.getByLabelText('Carregando o gráfico')).toBeInTheDocument()
  })

  it('a escala muda o vocabulário: por mês, "Melhor mês"', () => {
    const year = { from: '2026-01-01', to: '2026-12-31', granularity: 'month' as const, totalKg: 300, donationCount: 5, points: [{ start: '2026-09-01', totalKg: 100, donationCount: 2 }, { start: '2026-10-01', totalKg: 200, donationCount: 3 }] }
    renderChart({ series: year, previous: undefined, compare: false, mode: 'ano' })
    expect(screen.getByText('Melhor mês')).toBeInTheDocument()
    expect(screen.getByText('Média por mês')).toBeInTheDocument()
    expect(within(tile('Melhor mês')).getByText('Outubro de 2026')).toBeInTheDocument()
  })
})
