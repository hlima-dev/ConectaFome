# Gráficos do ConectaFome: lógica e código

Este guia explica **como os gráficos funcionam** e traz o **código real** (copiado dos arquivos do projeto, sem edição).
Cada trecho informa o arquivo de onde veio, para você abrir e acompanhar no editor.

## 1. Visão geral

O projeto tem **dois tipos de gráfico**, ambos feitos com a biblioteca **Recharts** (v2.15, para React):

| Gráfico | Onde aparece | Tipo | Arquivo principal |
|---|---|---|---|
| **Kg resgatado** (por dia, semana ou mês) | **Relatórios** (versão completa) e **Painel** (versão compacta) | Barras ou área, com linha da média, pico em destaque e período anterior pontilhado | `frontend/src/components/reports/KgChart.tsx` |
| **Status das doações** | **Painel** (só administração) | Rosca (donut) com legenda e porcentagens | `frontend/src/pages/Dashboard.tsx` |

**Mapa dos arquivos**

```
backend/src/
  services/ReportService.ts         série de dados do gráfico (SQL + preenchimento de zeros)
  controllers/ReportController.ts   validação dos parâmetros (Zod)
  routes/reports.routes.ts          GET /api/v1/reports/series  (só administrador)

frontend/src/
  utils/period.ts                   regras de período: semana, mês, ano, personalizado, rótulos
  services/reports.ts               chamada HTTP (getSeries)
  hooks/useReports.ts               useSeries (TanStack Query)
  hooks/useCountUp.ts               número que "sobe" até o valor final
  components/reports/
    KgChart.tsx                     o gráfico em si (resumo + barras/área + tabela)
    PeriodControls.tsx              botões Semana/Mês/Ano e setas de navegação
    PeriodFilter.tsx                barra completa dos Relatórios (comparar, doador, receptor, exportar)
  pages/reports/ReportsPage.tsx     monta a tela dos Relatórios
  pages/Dashboard.tsx               monta o Painel (gráfico compacto + rosca)
```

## 2. O caminho dos dados (do clique ao gráfico)

```
Usuário escolhe "Mês" e clica na seta ←
   │
   ▼
utils/period.ts          rangeFor('mes', data)  →  { from: '2026-10-01', to: '2026-10-31', granularity: 'day' }
   │
   ▼
hooks/useReports.ts      useSeries({ from, to, granularity })  →  GET /api/v1/reports/series?from=...&to=...&granularity=day
   │
   ▼
ReportController.ts      valida (datas AAAA-MM-DD, ordem, escala)
   │
   ▼
ReportService.series()   1) lista todos os "baldes" do período (um por dia/semana/mês)
                         2) soma os kg e conta as doações coletadas por balde (SQL)
                         3) preenche com zero os baldes sem coleta
   │
   ▼
KgChart.tsx              calcula o resumo (total, média, pico) e monta as linhas do gráfico (useMemo)
   │
   ▼
Recharts                 desenha: Barras ou Área + linha da média + período anterior
```

**Ideias principais**
- **O servidor entrega a série pronta e completa** (sem "buracos"): se não houve coleta na quarta-feira, o ponto existe com 0 kg. Assim o gráfico nunca fica desalinhado.
- **A escala é decidida pelo tamanho do período**: semana e mês por dia, ano por mês; no personalizado, até 45 dias por dia, até 180 por semana, e mais que isso por mês. Isso evita um gráfico com centenas de pontos.
- **Cada período tem um período anterior de mesmo tamanho**, buscado numa segunda chamada igual, para comparar.

## 3. Backend: a série de dados

### 3.1 Rota e validação

`GET /api/v1/reports/series` aceita `from`, `to` (dias `AAAA-MM-DD`), `granularity` (`day`, `week` ou `month`) e, opcionalmente, `donorId` e `recipientId`. Só o administrador acessa.

```ts
// backend/src/controllers/ReportController.ts
const seriesQuerySchema = z
  .object({
    from: isoDate,
    to: isoDate,
    granularity: z.enum(['day', 'week', 'month']).default('day'),
    donorId: z.string().optional(),
    recipientId: z.string().optional(),
  })
  .refine((p) => p.from <= p.to, { message: 'A data inicial não pode ser depois da final', path: ['from'] })
```

### 3.2 Funções auxiliares: fuso e "baldes"

Pontos importantes:
- **Fuso horário.** O banco guarda as datas em UTC. Uma coleta às 22h em Brasília seria "dia seguinte" em UTC. Por isso os dias são recortados em **horário de Brasília (UTC-3)**: o dia `2026-11-10` vai de `10/11 03:00 UTC` até `11/11 03:00 UTC`. O Brasil não tem horário de verão desde 2019, então um deslocamento fixo de 3 horas basta.
- **Semana começa na segunda-feira**, igual ao `date_trunc('week')` do PostgreSQL. Se o período começa numa quarta, o primeiro balde de semana é a segunda anterior.
- **`bucketStarts`** gera todos os baldes do período; é ele que garante o preenchimento de zeros.

```ts
// backend/src/services/ReportService.ts (trecho)
export type Granularity = 'day' | 'week' | 'month'

export interface SeriesFilter {
  from: string
  to: string
  granularity: Granularity
  donorId?: string
  recipientId?: string
}

// As datas dos relatórios são dias no horário de Brasília (UTC-3; o Brasil não tem
// horário de verão desde 2019). O banco guarda UTC, então o "dia" de uma coleta às
// 22h de Brasília cai no dia seguinte em UTC: por isso o recorte é feito por aqui.
const MAX_BUCKETS = 400

export function brtDayRange(from: string, to: string) {
  const gte = new Date(`${from}T00:00:00-03:00`)
  const lt = new Date(new Date(`${to}T00:00:00-03:00`).getTime() + DAY_MS)
  return { gte, lt }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const parseDay = (value: string) => new Date(`${value}T00:00:00.000Z`)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS)

// Início (segunda-feira, como o date_trunc('week') do PostgreSQL) da semana da data.
function mondayOf(d: Date) {
  const weekday = (d.getUTCDay() + 6) % 7 // seg = 0
  return addDays(d, -weekday)
}

// Todos os "baldes" do período, para o gráfico não ter buracos nos dias sem coleta.
export function bucketStarts(from: string, to: string, granularity: Granularity): string[] {
  const end = parseDay(to)
  const out: string[] = []
  if (granularity === 'day') {
    for (let d = parseDay(from); d <= end; d = addDays(d, 1)) out.push(ymd(d))
  } else if (granularity === 'week') {
    for (let d = mondayOf(parseDay(from)); d <= end; d = addDays(d, 7)) out.push(ymd(d))
  } else {
    const start = parseDay(from)
    for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); d <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      out.push(ymd(d))
    }
  }
  return out
}

// Período em datas inclusivas (AAAA-MM-DD, tratadas em UTC). Vazio = sem limite.
export interface PeriodFilter {
  from?: string
  to?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

// Doações "do período" = as registradas nele (createdAt). O fim é inclusivo:
// `to` = 2026-11-30 inclui tudo até 30/11 às 23:59.
function createdAtRange(period: PeriodFilter) {
  if (!period.from && !period.to) return {}
  return {
    createdAt: {
      ...(period.from ? { gte: new Date(`${period.from}T00:00:00.000Z`) } : {}),
      ...(period.to ? { lt: new Date(new Date(`${period.to}T00:00:00.000Z`).getTime() + DAY_MS) } : {}),
    },
  }
}

const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null)

// COLETADA e ENTREGUE contam juntas como "resgatado" em todo relatório — o
// resgate de verdade já aconteceu na coleta; ENTREGUE é só um estado
// posterior da mesma doação (ver nota no schema sobre o ciclo de status).
const RESCUED_STATUSES: DonationStatus[] = [DonationStatus.COLETADA, DonationStatus.ENTREGUE]
```

### 3.3 O método `series`

Faz três coisas: valida o tamanho do período (máximo de 400 pontos), consulta o banco agrupando por balde, e **junta o resultado com a lista completa de baldes**.

Detalhe do SQL: `"collectedAt" - interval '3 hours'` converte o horário para Brasília antes de agrupar com `date_trunc`. Só contam doações com status **COLETADA** ou **ENTREGUE** (o que foi de fato resgatado).

```ts
// backend/src/services/ReportService.ts (trecho)
  // Série para o gráfico: kg e nº de doações coletadas por dia, semana ou mês, com os
  // períodos sem coleta preenchidos com zero.
  async series(filter: SeriesFilter) {
    if (filter.from > filter.to) throw new ValidationError('A data inicial não pode ser depois da final')
    const starts = bucketStarts(filter.from, filter.to, filter.granularity)
    if (starts.length > MAX_BUCKETS) {
      throw new ValidationError(`Período grande demais para esta escala (${starts.length} pontos). Use semanas ou meses.`)
    }

    const { gte, lt } = brtDayRange(filter.from, filter.to)
    const conditions = [
      Prisma.sql`status IN ('COLETADA', 'ENTREGUE')`,
      Prisma.sql`"collectedAt" >= ${gte}`,
      Prisma.sql`"collectedAt" < ${lt}`,
    ]
    if (filter.donorId) conditions.push(Prisma.sql`"donorId" = ${filter.donorId}`)
    if (filter.recipientId) conditions.push(Prisma.sql`"recipientId" = ${filter.recipientId}`)

    const rows = await prisma.$queryRaw<{ bucket: string; total_kg: number; donation_count: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc(${filter.granularity}::text, "collectedAt" - interval '3 hours'), 'YYYY-MM-DD') AS bucket,
             SUM("collectedQuantityKg")::float AS total_kg,
             COUNT(*)::int AS donation_count
      FROM donations
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY bucket
    `)
    const byBucket = new Map(rows.map((r) => [r.bucket, r]))

    const points = starts.map((start) => {
      const row = byBucket.get(start)
      return { start, totalKg: Number(row?.total_kg ?? 0), donationCount: Number(row?.donation_count ?? 0) }
    })
    return {
      from: filter.from,
      to: filter.to,
      granularity: filter.granularity,
      totalKg: Math.round(points.reduce((sum, p) => sum + p.totalKg, 0) * 100) / 100,
      donationCount: points.reduce((sum, p) => sum + p.donationCount, 0),
      points,
    }
  }
```

## 4. Frontend: regras de período (`utils/period.ts`)

Este arquivo **não depende de React**: são funções puras, fáceis de testar (há testes em `frontend/tests/period.test.ts`). Ele define:

- `rangeFor(modo, data)`: devolve `{ from, to, granularity }` da semana, mês, ano ou intervalo personalizado.
- `shiftRef(modo, data, ±1)`: anda para o período anterior ou seguinte (seta ← →).
- `previousRange(...)`: período anterior de mesmo tamanho, usado na comparação.
- `granularityFor(from, to)`: escolhe dia, semana ou mês conforme o tamanho.
- `periodLabel`, `tickLabel`, `pointTitle`: textos em português (nome do período, eixo X e título do tooltip).

```ts
// frontend/src/utils/period.ts
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
```

## 5. Frontend: o componente `KgChart`

É o coração visual. Recebe a série (`series`), a série do período anterior (`previous`) e o modo, e decide tudo o que aparece.

**Lógica dos dados (dentro do `useMemo`)**
1. **`rows`**: transforma cada ponto da série numa linha com rótulo do eixo, título do tooltip, kg, nº de doações, **% do total**, valor do período anterior (alinhado **pela posição**: 1º dia com 1º dia) e a marca `peak` (o maior valor).
2. **Média**: total ÷ nº de períodos **que já passaram**. Num período em andamento (por exemplo, o mês atual), os dias futuros valem 0 só porque não aconteceram; se entrassem na conta, a média ficaria falsamente baixa.
3. **Pico**: o ponto de maior kg ganha degradê âmbar (`url(#kgPeak)`) e o selo "pico" no tooltip.
4. **Variação (▲/▼ %)**: `(atual − anterior) / anterior`. Se o período anterior teve 0 kg, **não inventa porcentagem**: mostra "Sem coletas no período anterior".

**Composição do gráfico (Recharts)**
- `ComposedChart` permite misturar `Bar`/`Area` com `Line` (a linha pontilhada do período anterior) e `ReferenceLine` (a linha tracejada da média).
- Degradês declarados em `<defs>` (`kgBar`, `kgPeak`, `kgArea`) e usados por `fill="url(#...)"`.
- `Tooltip` com componente próprio (`ChartTooltip`): mostra dia, kg, doações, % do total e o valor anterior.
- **Barras ou Área**: botão que alterna o estado `type`.
- **Versão compacta** (`compact`): usada no Painel; esconde os quatro cartões de resumo e a tabela.

**Cuidados de qualidade**
- **Acessibilidade**: o gráfico tem `role="img"` com descrição em texto ("total de X kg, melhor dia com Y kg") e uma **tabela com os mesmos dados** (`<details>`).
- **Carregamento**: esqueleto animado na primeira vez; nas trocas de período o gráfico anterior fica na tela até o novo chegar (`placeholderData` do TanStack Query), sem piscar.
- **Estado vazio**: mensagem amigável quando não há coleta no período.
- **Animações**: o `useCountUp` faz o total "subir" até o valor; respeita a preferência do sistema por menos movimento.

```tsx
// frontend/src/components/reports/KgChart.tsx
import { useMemo, useState } from 'react'
import { Area, Bar, CartesianGrid, Cell, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { ArrowDownRight, ArrowUpRight, BarChart3, Gauge, LineChart, PackageCheck, Sprout, Trophy } from 'lucide-react'
import { useCountUp } from '../../hooks/useCountUp'
import { formatKg } from '../../utils/format'
import { capitalizeFirst, includesToday, pointTitle, tickLabel, toDay, UNIT_LABEL, type PeriodMode } from '../../utils/period'
import type { SeriesData } from '../../types/reports'

interface Props {
  series: SeriesData | undefined
  previous: SeriesData | undefined
  mode: PeriodMode
  loading: boolean
  compare: boolean
  // Versão para o Painel: sem o resumo em cartões (o painel já tem os seus) e sem a tabela.
  compact?: boolean
  today?: Date
}

interface Row {
  start: string
  label: string
  title: string
  kg: number
  count: number
  prev: number | null
  prevTitle: string | null
  share: number
  peak: boolean
}

const compactKg = (v: number) => (v >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t` : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`)

function Tile({ icon: Icon, tone, label, children, hint }: { icon: typeof Gauge; tone: string; label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="fade-up rounded-xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone}`}>
          <Icon size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <div className="truncate text-xl font-semibold text-slate-900">{children}</div>
        </div>
      </div>
      {hint && <div className="mt-2 text-xs text-slate-500">{hint}</div>}
    </div>
  )
}

function Delta({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) {
    return current > 0 ? <span className="font-medium text-emerald-700">Sem coletas no período anterior</span> : <span>Sem coletas nos dois períodos</span>
  }
  const pct = ((current - previous) / previous) * 100
  const up = pct >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-semibold ${up ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
        <Icon size={13} aria-hidden="true" />
        {Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%
      </span>
      <span>vs. {formatKg(Math.round(previous * 10) / 10)} no período anterior</span>
    </span>
  )
}

interface TooltipProps {
  active?: boolean
  payload?: { payload: Row }[]
  compare: boolean
}

function ChartTooltip({ active, payload, compare }: TooltipProps) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="min-w-[13rem] rounded-xl border border-slate-200 bg-white/95 p-3 text-sm shadow-xl backdrop-blur">
      <p className="mb-1.5 flex items-center justify-between gap-3 font-semibold text-slate-900">
        {row.title}
        {row.peak && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">pico</span>}
      </p>
      <p className="flex items-center gap-2 text-slate-700">
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-600" aria-hidden="true" />
        <span className="font-semibold">{formatKg(row.kg)}</span>
        <span className="text-slate-400">· {row.count} {row.count === 1 ? 'doação' : 'doações'}</span>
      </p>
      {row.share > 0 && <p className="mt-0.5 text-xs text-slate-500">{row.share.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% do total do período</p>}
      {compare && row.prev !== null && (
        <p className="mt-1.5 flex items-center gap-2 border-t border-slate-100 pt-1.5 text-xs text-slate-500">
          <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
          Anterior ({row.prevTitle}): <span className="font-medium text-slate-700">{formatKg(row.prev)}</span>
        </p>
      )}
    </div>
  )
}

// Gráfico de kg resgatado por dia, semana ou mês: resumo do período no topo (total com
// comparação, média, melhor ponto e nº de coletas), gráfico com barras ou área, linha da
// média, destaque do pico e o período anterior ao fundo.
export function KgChart({ series, previous, mode, loading, compare, compact = false, today = new Date() }: Props) {
  const [type, setType] = useState<'bar' | 'area'>('bar')
  const todayKey = toDay(today)

  const { rows, average, peak, elapsed } = useMemo(() => {
    const points = series?.points ?? []
    const total = series?.totalKg ?? 0
    const maxKg = Math.max(0, ...points.map((p) => p.totalKg))
    const prevPoints = previous?.points ?? []
    const data: Row[] = points.map((p, i) => ({
      start: p.start,
      label: tickLabel(p.start, series!.granularity, mode),
      title: capitalizeFirst(pointTitle(p.start, series!.granularity)),
      kg: p.totalKg,
      count: p.donationCount,
      prev: compare && prevPoints[i] ? prevPoints[i].totalKg : null,
      prevTitle: compare && prevPoints[i] ? capitalizeFirst(pointTitle(prevPoints[i].start, previous!.granularity)) : null,
      share: total > 0 ? (p.totalKg / total) * 100 : 0,
      peak: maxKg > 0 && p.totalKg === maxKg,
    }))
    // A média considera só os dias que já passaram: num período em andamento, os dias
    // futuros (zerados por não terem acontecido) não podem puxar a média para baixo.
    const elapsedCount = data.filter((r) => r.start <= todayKey).length || data.length
    return { rows: data, average: total / Math.max(1, elapsedCount), peak: data.find((r) => r.peak), elapsed: elapsedCount }
  }, [series, previous, mode, compare, todayKey])

  const total = series?.totalKg ?? 0
  const shownTotal = useCountUp(total)
  const unit = UNIT_LABEL[series?.granularity ?? 'day']
  const isEmpty = !loading && series !== undefined && total === 0
  const comparing = compare && previous !== undefined

  if (!series && loading) {
    return (
      <div className="mb-6 animate-pulse space-y-4" aria-busy="true" aria-label="Carregando o gráfico">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-xl bg-slate-200/70" />)}
        </div>
        <div className="h-80 rounded-2xl bg-slate-200/70" />
      </div>
    )
  }
  if (!series) return null

  return (
    <section className="mb-6" aria-labelledby="kg-chart-title">
      {!compact && (
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon={Sprout} tone="bg-emerald-100 text-emerald-700" label="Kg resgatado" hint={comparing ? <Delta current={total} previous={previous!.totalKg} /> : undefined}>
          <span aria-label={formatKg(total)}>{formatKg(Math.round(shownTotal * 10) / 10)}</span>
        </Tile>
        <Tile icon={Gauge} tone="bg-sky-100 text-sky-700" label={`Média por ${unit.singular}`} hint={`considera ${elapsed} ${elapsed === 1 ? unit.singular : unit.plural}`}>
          {formatKg(Math.round(average * 10) / 10)}
        </Tile>
        <Tile icon={Trophy} tone="bg-amber-100 text-amber-700" label={`Melhor ${unit.singular}`} hint={peak ? peak.title : 'Sem coletas no período'}>
          {peak ? formatKg(peak.kg) : '—'}
        </Tile>
        <Tile icon={PackageCheck} tone="bg-violet-100 text-violet-700" label="Doações coletadas" hint={`${rows.filter((r) => r.count > 0).length} de ${rows.length} ${rows.length === 1 ? unit.singular : unit.plural} com coleta`}>
          {series.donationCount}
        </Tile>
      </div>
      )}

      <div className="fade-up rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="kg-chart-title" className="text-base font-semibold text-slate-900">Kg resgatado por {unit.singular}</h2>
            <p className="text-xs text-slate-500">Alimento coletado no período, por data da coleta (horário de Brasília).</p>
          </div>
          <div className="flex items-center gap-4">
            {comparing && (
              <span className="hidden items-center gap-1.5 text-xs text-slate-500 sm:inline-flex">
                <span className="h-0.5 w-5 border-t-2 border-dashed border-slate-400" aria-hidden="true" /> Período anterior
              </span>
            )}
            <div role="radiogroup" aria-label="Tipo de gráfico" className="inline-flex rounded-lg bg-slate-100 p-0.5">
              {([['bar', 'Barras', BarChart3], ['area', 'Área', LineChart]] as const).map(([id, label, Icon]) => (
                <button key={id} type="button" role="radio" aria-checked={type === id} onClick={() => setType(id)} className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${type === id ? 'bg-white text-emerald-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
                  <Icon size={14} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isEmpty && !comparing ? (
          <div className={`flex ${compact ? 'h-56' : 'h-72'} flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center`}>
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Sprout size={26} aria-hidden="true" /></span>
            <p className="font-medium text-slate-700">Nenhuma coleta neste período</p>
            <p className="max-w-xs text-sm text-slate-500">Escolha outro período ou limpe os filtros de doador e receptor para ver o que foi resgatado.</p>
          </div>
        ) : (
          <div className={`${compact ? 'h-64' : 'h-80'} w-full`} role="img" aria-label={`Gráfico de kg resgatado por ${unit.singular}: total de ${formatKg(total)}${peak ? `, melhor ${unit.singular} com ${formatKg(peak.kg)}` : ''}.`}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={rows} margin={{ top: 16, right: 12, left: -8, bottom: 0 }}>
                <defs>
                  <linearGradient id="kgBar" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="100%" stopColor="#047857" />
                  </linearGradient>
                  <linearGradient id="kgPeak" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#fcd34d" />
                    <stop offset="100%" stopColor="#d97706" />
                  </linearGradient>
                  <linearGradient id="kgArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={14} tick={{ fontSize: 11, fill: '#64748b' }} />
                <YAxis tickLine={false} axisLine={false} width={48} tickFormatter={compactKg} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip content={<ChartTooltip compare={comparing} />} cursor={type === 'bar' ? { fill: 'rgba(16,185,129,0.08)', radius: 8 } : { stroke: '#10b981', strokeDasharray: '4 4' }} />
                {average > 0 && <ReferenceLine y={average} stroke="#f59e0b" strokeDasharray="5 5" ifOverflow="extendDomain" label={{ value: `média ${compactKg(average)} kg`, position: 'insideTopRight', fill: '#b45309', fontSize: 11 }} />}
                {type === 'bar' ? (
                  <Bar dataKey="kg" radius={[8, 8, 0, 0]} maxBarSize={52} animationDuration={900} animationEasing="ease-out" activeBar={{ fill: '#065f46' }}>
                    {rows.map((row) => <Cell key={row.start} fill={row.peak ? 'url(#kgPeak)' : 'url(#kgBar)'} />)}
                  </Bar>
                ) : (
                  <Area type="monotone" dataKey="kg" stroke="#059669" strokeWidth={3} fill="url(#kgArea)" dot={{ r: 3, fill: '#059669', strokeWidth: 0 }} activeDot={{ r: 6, stroke: '#fff', strokeWidth: 2 }} animationDuration={900} animationEasing="ease-out" />
                )}
                {comparing && <Line type="linear" dataKey="prev" stroke="#94a3b8" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={false} connectNulls animationDuration={900} />}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}

        {!compact && (
        <details className="mt-4 text-sm">
          <summary className="cursor-pointer select-none text-xs font-medium text-slate-500 hover:text-slate-800">Ver os dados em tabela</summary>
          <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-100">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2">{unit.singular[0].toUpperCase() + unit.singular.slice(1)}</th>
                  <th className="px-3 py-2 text-right">Doações</th>
                  <th className="px-3 py-2 text-right">Kg resgatado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => (
                  <tr key={r.start}>
                    <td className="px-3 py-1.5">{r.title}</td>
                    <td className="px-3 py-1.5 text-right">{r.count}</td>
                    <td className="px-3 py-1.5 text-right font-medium">{formatKg(r.kg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
        )}
      </div>
      {!compact && includesToday({ from: series.from, to: series.to, granularity: series.granularity }, today) && (
        <p className="mt-2 text-xs text-slate-400">Período em andamento: a média considera só os {unit.plural} que já passaram.</p>
      )}
    </section>
  )
}
```

### 5.1 Hook do contador animado

```ts
// frontend/src/hooks/useCountUp.ts
import { useEffect, useRef, useState } from 'react'

// Número que "sobe" até o valor novo em vez de aparecer de uma vez. Respeita quem
// prefere menos movimento (e ambientes sem animação, como os testes): nesses casos
// mostra o valor direto.
export function useCountUp(target: number, durationMs = 700): number {
  const reduced = typeof window === 'undefined' || typeof window.matchMedia !== 'function' || window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const [value, setValue] = useState(target)
  const from = useRef(target)

  useEffect(() => {
    if (reduced) return
    const start = performance.now()
    const origin = from.current
    let frame = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      const eased = 1 - Math.pow(1 - t, 3)
      const current = origin + (target - origin) * eased
      from.current = current
      setValue(current)
      if (t < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs, reduced])

  return reduced ? target : value
}
```

### 5.2 Botões de período (Semana/Mês/Ano e setas)

Usados nos **Relatórios** (via `PeriodFilter`) e no **Painel**. A seta "próximo" fica desligada quando o período já contém hoje.

```tsx
// frontend/src/components/reports/PeriodControls.tsx
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { capitalizeFirst, includesToday, periodLabel, type PeriodMode, type PeriodRange } from '../../utils/period'

const MODE_LABELS: Record<PeriodMode, string> = { semana: 'Semana', mes: 'Mês', ano: 'Ano', personalizado: 'Personalizado' }

// Escala do período em botões segmentados (semana, mês, ano...). Usado nos Relatórios e no Painel.
export function ModeSwitch({ modes, value, onChange }: { modes: PeriodMode[]; value: PeriodMode; onChange: (mode: PeriodMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Escala do período" className="inline-flex rounded-xl bg-slate-100 p-1">
      {modes.map((mode) => {
        const active = value === mode
        return (
          <button
            key={mode}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(mode)}
            className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${active ? 'bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-200' : 'text-slate-500 hover:text-slate-800'}`}
          >
            {MODE_LABELS[mode]}
          </button>
        )
      })}
    </div>
  )
}

// Setas para o período anterior/seguinte, com o nome do período no meio. "Próximo" fica
// desligado quando o período já contém hoje (não há futuro a mostrar).
export function PeriodNavigator({ mode, range, onMove, today = new Date() }: { mode: PeriodMode; range: PeriodRange; onMove: (direction: 1 | -1) => void; today?: Date }) {
  const atPresent = includesToday(range, today)
  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
      <button type="button" aria-label="Período anterior" onClick={() => onMove(-1)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-emerald-800 hover:shadow-sm">
        <ChevronLeft size={18} aria-hidden="true" />
      </button>
      <p className="flex min-w-[12rem] items-center justify-center gap-2 px-2 text-center text-sm font-semibold text-slate-900" aria-live="polite">
        <CalendarDays size={16} className="text-emerald-700" aria-hidden="true" />
        {capitalizeFirst(periodLabel(mode, range))}
      </p>
      <button type="button" aria-label="Próximo período" disabled={atPresent} onClick={() => onMove(1)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-emerald-800 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent">
        <ChevronRight size={18} aria-hidden="true" />
      </button>
    </div>
  )
}
```

> `PeriodFilter.tsx` (barra completa dos Relatórios, com modo Personalizado, atalhos de 7/30/90 dias, "Comparar com o período anterior", filtros de doador e receptor e exportação CSV) tem 158 linhas e usa estes mesmos controles. Está em `frontend/src/components/reports/PeriodFilter.tsx`.

## 6. Como as telas usam o gráfico

### 6.1 Painel (versão compacta)

Estado do período, busca da série e montagem do gráfico:

```tsx
// frontend/src/pages/Dashboard.tsx (trechos)
  const [mode, setMode] = useState<PeriodMode>('ano')
  const [ref, setRef] = useState(() => new Date())
  const range = useMemo(() => rangeFor(mode, ref), [mode, ref])
  const { data: series, isLoading: loadingSeries } = useSeries(isAdmin ? { from: range.from, to: range.to, granularity: range.granularity } : null)

// ... dentro do JSX:
            <div className="lg:col-span-3">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <ModeSwitch modes={DASHBOARD_MODES} value={mode} onChange={(next) => { setMode(next); setRef(new Date()) }} />
                <PeriodNavigator mode={mode} range={range} onMove={(direction) => setRef((r) => shiftRef(mode, r, direction))} />
              </div>
              <KgChart series={series} previous={undefined} mode={mode} loading={loadingSeries} compare={false} compact />
            </div>
```

### 6.2 Relatórios (versão completa)

Em `frontend/src/pages/reports/ReportsPage.tsx`, o período vem do estado (`mode`, `ref`, `custom`), e são feitas **duas buscas** da série: a do período atual e a do anterior (só quando "Comparar" está ligado). Os indicadores e as tabelas por doador e receptor usam o mesmo `from`/`to`.

## 7. O gráfico de rosca: status das doações

É mais simples: recebe do servidor um objeto `donationsByStatus` (ex.: `{ ENTREGUE: 6, DISPONIVEL: 3 }`), transforma em lista, **descarta os status com zero** e pinta cada fatia com a cor do status (mesma lógica de cores dos selos do sistema: cinza = inicial, azul = em andamento, verde = concluído, vermelho = cancelado, âmbar = perdido). A **legenda ao lado** mostra a contagem e a porcentagem de cada status.

```tsx
// frontend/src/pages/Dashboard.tsx (trechos)
// Cores por estado, na mesma lógica do StatusBadge (cinza = inicial, azul =
// em andamento, verde = concluído, vermelho = cancelado, âmbar = perdido).
const STATUS_COLORS: Record<DonationStatus, string> = {
  DISPONIVEL: '#94a3b8',
  RESERVADA: '#60a5fa',
  AGENDADA: '#3b82f6',
  COLETADA: '#0d9488',
  ENTREGUE: '#059669',
  CANCELADA: '#ef4444',
  VENCIDA: '#f59e0b',
}

  const statusData = (Object.keys(STATUS_COLORS) as DonationStatus[])
    .map((status) => ({ status, name: DONATION_STATUS_LABELS[status], value: summary?.donationsByStatus?.[status] ?? 0 }))
    .filter((row) => row.value > 0)
  const totalDonations = statusData.reduce((sum, row) => sum + row.value, 0)

// ... dentro do JSX:
                  <div style={{ width: 150, height: 150 }}>
                    <PieChart width={150} height={150}>
                      <Pie data={statusData} isAnimationActive={false} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                        {statusData.map((row) => (
                          <Cell key={row.status} fill={STATUS_COLORS[row.status]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </div>
```

## 8. Como criar um gráfico novo (receita)

1. **Backend**: crie um método em `ReportService` que devolva uma lista pronta (`[{ rotulo, valor }]`), com a rota em `reports.routes.ts` e a validação no controller. Restrinja à administração com `authorize(Role.ADMIN)`.
2. **Teste de integração** do endpoint com PostgreSQL real (veja `backend/tests/integration/serie.test.ts` como modelo).
3. **Frontend**: adicione a função em `services/reports.ts` e um hook em `hooks/useReports.ts` (copie o `useSeries`).
4. **Componente**: use `ResponsiveContainer` + o gráfico do Recharts, e reaproveite os degradês e o tooltip do `KgChart` para manter o estilo.
5. **Acessibilidade**: sempre inclua `role="img"` com um texto descritivo e, se possível, uma tabela com os dados.

## 9. Testes que protegem os gráficos

| O que testa | Arquivo |
|---|---|
| Regras de período (semana, mês, ano, virada de mês/ano, bissexto, rótulos) | `frontend/tests/period.test.ts` |
| Resumo, média, melhor ponto, variação, estado vazio, tabela, troca barras/área | `frontend/tests/KgChart.test.tsx` |
| Tela de Relatórios: período, setas, comparação, filtros, exportação | `frontend/tests/ReportsPage.test.tsx` |
| Painel: gráfico compacto, troca de período, rosca | `frontend/tests/Dashboard.test.tsx` |
| Baldes e fuso horário (funções puras) | `backend/tests/reportSeries.test.ts` |
| Série com PostgreSQL real: zeros, fuso de Brasília, semana, mês, filtros, limites, permissões | `backend/tests/integration/serie.test.ts` |

## 10. Decisões e limites (para saber se alguém perguntar)

- **Os testes não desenham o gráfico**: no ambiente de teste (jsdom) o Recharts não tem tamanho para renderizar, então ele é substituído por um "dublê" e os testes verificam o **resumo, a tabela e as regras**. O visual foi conferido abrindo o sistema num navegador de verdade.
- **O período anterior é alinhado pela posição**, não pela data: no gráfico de um mês, o dia 5 é comparado com o dia 5 do mês anterior (mesmo que um seja quinta e o outro, segunda). Meses de tamanhos diferentes deixam a ponta final sem par.
- **Total do gráfico ≠ indicadores**: o gráfico conta **pela data da coleta**; os indicadores (taxa de resgate, perda etc.) contam **as doações registradas no período**. A tela avisa isso.
- **Fuso fixo em UTC-3**: simples e correto hoje; se o Brasil voltar a ter horário de verão, é preciso trocar por conversão de fuso do banco.
- **A escala máxima é de 400 pontos**; períodos maiores pedem semanas ou meses.
