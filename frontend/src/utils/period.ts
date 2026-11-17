// Períodos dos relatórios: semana (segunda a domingo), mês, ano ou intervalo
// personalizado. Tudo em dias "AAAA-MM-DD" do calendário local, que é o que o servidor
// espera (ele interpreta como dias de Brasília).
export type PeriodMode = 'semana' | 'mes' | 'ano' | 'personalizado'
export type Granularity = 'day' | 'week' | 'month'

export interface PeriodRange {
  from: string
  to: string
  granularity: Granularity
}

const DAY_MS = 86_400_000
const pad = (n: number) => String(n).padStart(2, '0')

export const toDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
export const fromDay = (value: string) => {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const daysBetween = (a: string, b: string) => Math.round((fromDay(b).getTime() - fromDay(a).getTime()) / DAY_MS)

// Escala do gráfico conforme o tamanho do intervalo, para nunca ter pontos demais.
export function granularityFor(from: string, to: string): Granularity {
  const days = daysBetween(from, to) + 1
  if (days <= 45) return 'day'
  if (days <= 180) return 'week'
  return 'month'
}

export function defaultCustom(today: Date = new Date()): { from: string; to: string } {
  return { from: toDay(addDays(today, -29)), to: toDay(today) }
}

export function rangeFor(mode: PeriodMode, ref: Date, custom?: { from: string; to: string }): PeriodRange {
  if (mode === 'semana') {
    const monday = addDays(ref, -((ref.getDay() + 6) % 7))
    return { from: toDay(monday), to: toDay(addDays(monday, 6)), granularity: 'day' }
  }
  if (mode === 'mes') {
    return { from: toDay(new Date(ref.getFullYear(), ref.getMonth(), 1)), to: toDay(new Date(ref.getFullYear(), ref.getMonth() + 1, 0)), granularity: 'day' }
  }
  if (mode === 'ano') {
    return { from: `${ref.getFullYear()}-01-01`, to: `${ref.getFullYear()}-12-31`, granularity: 'month' }
  }
  const c = custom ?? defaultCustom(ref)
  return { from: c.from, to: c.to, granularity: granularityFor(c.from, c.to) }
}

// Anda um período para trás (-1) ou para frente (+1).
export function shiftRef(mode: PeriodMode, ref: Date, direction: 1 | -1): Date {
  if (mode === 'semana') return addDays(ref, 7 * direction)
  if (mode === 'mes') return new Date(ref.getFullYear(), ref.getMonth() + direction, 1)
  if (mode === 'ano') return new Date(ref.getFullYear() + direction, 0, 1)
  return ref
}

// Período imediatamente anterior, para comparar. Nos modos fixos é o anterior do
// calendário; no personalizado, o mesmo número de dias logo antes.
export function previousRange(mode: PeriodMode, ref: Date, range: PeriodRange): PeriodRange {
  if (mode !== 'personalizado') return rangeFor(mode, shiftRef(mode, ref, -1))
  const length = daysBetween(range.from, range.to) + 1
  const to = toDay(addDays(fromDay(range.from), -1))
  const from = toDay(addDays(fromDay(to), -(length - 1)))
  return { from, to, granularity: range.granularity }
}

export const isFuture = (range: PeriodRange, today: Date = new Date()) => range.from > toDay(today)
export const includesToday = (range: PeriodRange, today: Date = new Date()) => range.from <= toDay(today) && toDay(today) <= range.to

const fmt = (value: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', ...options }).format(new Date(`${value}T00:00:00Z`))

const MONTH_SHORT = (value: string) => fmt(value, { month: 'short' }).replace('.', '')

export function periodLabel(mode: PeriodMode, range: PeriodRange): string {
  if (mode === 'mes') return fmt(range.from, { month: 'long', year: 'numeric' })
  if (mode === 'ano') return fmt(range.from, { year: 'numeric' })
  const sameMonth = range.from.slice(0, 7) === range.to.slice(0, 7)
  const sameYear = range.from.slice(0, 4) === range.to.slice(0, 4)
  if (mode === 'semana') {
    const start = sameMonth ? fmt(range.from, { day: 'numeric' }) : `${fmt(range.from, { day: 'numeric' })} ${MONTH_SHORT(range.from)}`
    return `${start} a ${fmt(range.to, { day: 'numeric' })} ${MONTH_SHORT(range.to)} ${sameYear ? range.to.slice(0, 4) : ''}`.trim()
  }
  return `${fmt(range.from, { day: '2-digit', month: '2-digit', year: 'numeric' })} a ${fmt(range.to, { day: '2-digit', month: '2-digit', year: 'numeric' })}`
}

// Rótulo curto do eixo.
export function tickLabel(start: string, granularity: Granularity, mode: PeriodMode): string {
  if (granularity === 'month') return MONTH_SHORT(start)
  if (granularity === 'week') return fmt(start, { day: '2-digit', month: '2-digit' })
  if (mode === 'semana') return `${fmt(start, { weekday: 'short' }).replace('.', '')} ${fmt(start, { day: 'numeric' })}`
  return fmt(start, { day: 'numeric' })
}

// Título completo do ponto (tooltip e tabela).
export function pointTitle(start: string, granularity: Granularity): string {
  if (granularity === 'month') return fmt(start, { month: 'long', year: 'numeric' })
  if (granularity === 'week') {
    const end = toDay(addDays(fromDay(start), 6))
    return `Semana de ${fmt(start, { day: 'numeric', month: 'short' }).replace('.', '')} a ${fmt(end, { day: 'numeric', month: 'short' }).replace('.', '')}`
  }
  return fmt(start, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

export const UNIT_LABEL: Record<Granularity, { singular: string; plural: string; the: string }> = {
  day: { singular: 'dia', plural: 'dias', the: 'do dia' },
  week: { singular: 'semana', plural: 'semanas', the: 'da semana' },
  month: { singular: 'mês', plural: 'meses', the: 'do mês' },
}

// Só a primeira letra maiúscula ("novembro de 2026" → "Novembro de 2026"); o `capitalize`
// do CSS poria maiúscula em todas as palavras ("De").
export const capitalizeFirst = (text: string) => (text ? text[0].toUpperCase() + text.slice(1) : text)
