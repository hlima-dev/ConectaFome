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
export function KgChart({ series, previous, mode, loading, compare, today = new Date() }: Props) {
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
          <div className="flex h-72 flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600"><Sprout size={26} aria-hidden="true" /></span>
            <p className="font-medium text-slate-700">Nenhuma coleta neste período</p>
            <p className="max-w-xs text-sm text-slate-500">Escolha outro período ou limpe os filtros de doador e receptor para ver o que foi resgatado.</p>
          </div>
        ) : (
          <div className="h-80 w-full" role="img" aria-label={`Gráfico de kg resgatado por ${unit.singular}: total de ${formatKg(total)}${peak ? `, melhor ${unit.singular} com ${formatKg(peak.kg)}` : ''}.`}>
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
      </div>
      {includesToday({ from: series.from, to: series.to, granularity: series.granularity }, today) && (
        <p className="mt-2 text-xs text-slate-400">Período em andamento: a média considera só os {unit.plural} que já passaram.</p>
      )}
    </section>
  )
}
