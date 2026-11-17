import { useMemo, useState } from 'react'
import { Boxes, CheckCircle2, Leaf, Percent, Timer, TrendingDown, Users, XCircle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useByDonor, useByRecipient, useRates, useSeries } from '../../hooks/useReports'
import { downloadDonationsCsv } from '../../services/reports'
import { getErrorMessage } from '../../utils/errors'
import { useDonors } from '../../hooks/useDonors'
import { useRecipients } from '../../hooks/useRecipients'
import { formatKg } from '../../utils/format'
import { defaultCustom, previousRange, rangeFor } from '../../utils/period'
import { PeriodFilter, type PeriodState } from '../../components/reports/PeriodFilter'
import { KgChart } from '../../components/reports/KgChart'

const percent = (value: number | null) => (value === null ? '—' : `${(value * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`)
const kg = formatKg

const TONES = {
  green: 'bg-emerald-100 text-emerald-700',
  amber: 'bg-amber-100 text-amber-700',
  red: 'bg-red-100 text-red-700',
  blue: 'bg-sky-100 text-sky-700',
  violet: 'bg-violet-100 text-violet-700',
} as const

function Kpi({ label, value, hint, icon: Icon, tone = 'green' }: { label: string; value: string; hint?: string; icon: LucideIcon; tone?: keyof typeof TONES }) {
  return (
    <div className="fade-up flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${TONES[tone]}`}>
        <Icon size={19} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 text-2xl font-semibold text-slate-900">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-slate-500">{hint}</p>}
      </div>
    </div>
  )
}

interface RankRow {
  id: string
  name: string
  donationCount: number
  totalKg: number
}

// Ranking com barra proporcional: dá para ver de relance quem mais contribuiu.
function Ranking({ title, rows, loading, firstColumn }: { title: string; rows: RankRow[]; loading: boolean; firstColumn: string }) {
  const max = Math.max(1, ...rows.map((r) => r.totalKg))
  return (
    <div className="fade-up rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="mb-4 text-base font-semibold text-slate-900">{title}</h2>
      {loading && <p className="text-sm text-slate-400">Carregando...</p>}
      {!loading && rows.length === 0 && <p className="text-sm text-slate-400">Nenhum dado neste período.</p>}
      {!loading && rows.length > 0 && (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="py-2">{firstColumn}</th>
              <th className="py-2 text-right">Doações</th>
              <th className="py-2 text-right">Kg resgatado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="py-2.5 pr-3">
                  <p className="truncate">{row.name}</p>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
                    <div className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-700 transition-all duration-700" style={{ width: `${Math.max(3, (row.totalKg / max) * 100)}%` }} />
                  </div>
                </td>
                <td className="py-2.5 text-right">{row.donationCount}</td>
                <td className="py-2.5 text-right font-medium">{formatKg(row.totalKg)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function ReportsPage() {
  // Abre no ano atual: é a visão que costuma ter dados; semana e mês ficam a um clique.
  const [state, setState] = useState<PeriodState>(() => ({
    mode: 'ano',
    ref: new Date(),
    custom: defaultCustom(),
    compare: true,
    donorId: '',
    recipientId: '',
  }))
  const [exportError, setExportError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)

  const range = useMemo(() => rangeFor(state.mode, state.ref, state.custom), [state.mode, state.ref, state.custom])
  const previous = useMemo(() => previousRange(state.mode, state.ref, range), [state.mode, state.ref, range])
  const invalidPeriod = !range.from || !range.to || range.from > range.to
  const period = { from: range.from, to: range.to }

  const filters = { donorId: state.donorId || undefined, recipientId: state.recipientId || undefined }
  const { data: series, isLoading: loadingSeries } = useSeries(invalidPeriod ? null : { ...period, granularity: range.granularity, ...filters })
  const { data: previousSeries } = useSeries(invalidPeriod || !state.compare ? null : { from: previous.from, to: previous.to, granularity: previous.granularity, ...filters })
  const { data: rates } = useRates(invalidPeriod ? undefined : period)
  const { data: byDonor, isLoading: loadingByDonor } = useByDonor(invalidPeriod ? undefined : period)
  const { data: byRecipient, isLoading: loadingByRecipient } = useByRecipient(invalidPeriod ? undefined : period)
  const { data: donors } = useDonors()
  const { data: recipients } = useRecipients()

  async function handleExport() {
    setExportError(null)
    setExporting(true)
    try {
      await downloadDonationsCsv(period)
    } catch (error) {
      setExportError(getErrorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold text-slate-900">Relatórios</h1>
      <p className="mb-5 text-sm text-slate-500">Alimento resgatado, por semana, mês ou ano: o indicador central do impacto da plataforma nos ODS 2 e 12.</p>

      <PeriodFilter
        value={state}
        range={range}
        donors={donors?.map((d) => ({ id: d.id, name: d.name }))}
        recipients={recipients?.map((r) => ({ id: r.id, name: r.name }))}
        onChange={(changes) => setState((s) => ({ ...s, ...changes }))}
        onExport={handleExport}
        exporting={exporting}
        invalidPeriod={invalidPeriod}
      />

      {exportError && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{exportError}</p>}

      <KgChart series={series} previous={state.compare ? previousSeries : undefined} mode={state.mode} loading={loadingSeries} compare={state.compare} />

      <section className="mb-6" aria-labelledby="rates-title">
        <div className="mb-3">
          <h2 id="rates-title" className="text-base font-semibold text-slate-900">Indicadores do período</h2>
          <p className="text-xs text-slate-500">Contam as doações <strong className="font-medium">registradas</strong> no período escolhido. O gráfico acima usa a <strong className="font-medium">data da coleta</strong>, por isso os totais podem diferir.</p>
        </div>

        {rates && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi icon={Boxes} label="Doações registradas" value={String(rates.registered)} />
            <Kpi icon={Leaf} label="Kg resgatado" value={kg(rates.rescuedKg)} hint={`${rates.rescued} das doações registradas, já coletadas`} />
            <Kpi icon={Percent} label="Taxa de resgate" value={percent(rates.rescueRate)} hint="coletadas ou entregues ÷ registradas" />
            <Kpi icon={TrendingDown} tone="amber" label="Perda antes da coleta" value={percent(rates.lossRate)} hint={`${rates.expired} vencidas · ${kg(rates.lostKg)}`} />
            <Kpi icon={CheckCircle2} tone="blue" label="Entrega confirmada" value={percent(rates.deliveryRate)} hint="entregues ÷ coletadas" />
            <Kpi icon={Timer} tone="blue" label="Tempo até a coleta" value={rates.avgHoursToCollect === null ? '—' : `${rates.avgHoursToCollect.toLocaleString('pt-BR')} h`} hint="média entre o registro e a coleta" />
            <Kpi icon={Users} tone="violet" label="Pessoas atendidas" value={rates.peopleServed.toLocaleString('pt-BR')} hint="das instituições com entrega no período" />
            <Kpi icon={XCircle} tone="red" label="Canceladas" value={String(rates.canceled)} />
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Ranking title="Por doador" firstColumn="Doador" loading={loadingByDonor} rows={(byDonor ?? []).map((r) => ({ id: r.donorId, name: r.donorName, donationCount: r.donationCount, totalKg: r.totalKg }))} />
        <Ranking title="Por receptor" firstColumn="Receptor" loading={loadingByRecipient} rows={(byRecipient ?? []).map((r) => ({ id: r.recipientId, name: r.recipientName, donationCount: r.donationCount, totalKg: r.totalKg }))} />
      </div>
    </div>
  )
}
