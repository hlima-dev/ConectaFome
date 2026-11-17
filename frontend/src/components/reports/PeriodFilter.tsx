import { CalendarDays, ChevronLeft, ChevronRight, Download, HeartHandshake, Store, X } from 'lucide-react'
import { capitalizeFirst, defaultCustom, fromDay, includesToday, isFuture, periodLabel, rangeFor, toDay, type PeriodMode, type PeriodRange } from '../../utils/period'

export interface PeriodState {
  mode: PeriodMode
  // Data de referência dos modos fixos (a semana/mês/ano que a contém).
  ref: Date
  custom: { from: string; to: string }
  compare: boolean
  donorId: string
  recipientId: string
}

interface Option {
  id: string
  name: string
}

interface Props {
  value: PeriodState
  range: PeriodRange
  donors?: Option[]
  recipients?: Option[]
  onChange: (changes: Partial<PeriodState>) => void
  onExport: () => void
  exporting: boolean
  invalidPeriod: boolean
  today?: Date
}

const MODES: { id: PeriodMode; label: string }[] = [
  { id: 'semana', label: 'Semana' },
  { id: 'mes', label: 'Mês' },
  { id: 'ano', label: 'Ano' },
  { id: 'personalizado', label: 'Personalizado' },
]

const PRESETS = [
  { label: 'Últimos 7 dias', days: 7 },
  { label: 'Últimos 30 dias', days: 30 },
  { label: 'Últimos 90 dias', days: 90 },
  { label: 'Últimos 12 meses', days: 365 },
]

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

function Select({ label, icon: Icon, value, options, onChange }: { label: string; icon: typeof Store; value: string; options: Option[]; onChange: (v: string) => void }) {
  const active = value !== ''
  return (
    <label className={`group relative flex items-center gap-2 rounded-full border py-1.5 pl-3 pr-2 text-sm transition-colors ${active ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'}`}>
      <Icon size={15} className={active ? 'text-emerald-700' : 'text-slate-400'} aria-hidden="true" />
      <span className="sr-only">{label}</span>
      <select aria-label={label} className="max-w-[11rem] cursor-pointer appearance-none truncate bg-transparent pr-1 outline-none" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{label}: todos</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.name}</option>
        ))}
      </select>
    </label>
  )
}

// Barra de período dos relatórios: escolhe semana, mês, ano ou um intervalo livre, anda
// para o período anterior/seguinte com as setas, compara com o período anterior e filtra
// por doador e receptor.
export function PeriodFilter({ value, range, donors = [], recipients = [], onChange, onExport, exporting, invalidPeriod, today = new Date() }: Props) {
  const fixed = value.mode !== 'personalizado'
  const nextRef = fixed ? rangeFor(value.mode, value.ref) : null
  // "Próximo" fica desligado quando o período atual já contém hoje (não há futuro a mostrar).
  const atPresent = fixed && nextRef !== null && (includesToday(nextRef, today) || isFuture(nextRef, today))
  const filtersActive = (value.donorId ? 1 : 0) + (value.recipientId ? 1 : 0)

  function move(direction: 1 | -1) {
    const r = value.ref
    const next =
      value.mode === 'semana' ? addDays(r, 7 * direction) : value.mode === 'mes' ? new Date(r.getFullYear(), r.getMonth() + direction, 1) : new Date(r.getFullYear() + direction, 0, 1)
    onChange({ ref: next })
  }

  function setMode(mode: PeriodMode) {
    // Ao trocar de modo, volta para o período que contém hoje.
    onChange({ mode, ref: today, ...(mode === 'personalizado' ? { custom: defaultCustom(today) } : {}) })
  }

  return (
    <section className="mb-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5" aria-label="Período e filtros dos relatórios">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Escala do período" className="inline-flex rounded-xl bg-slate-100 p-1">
          {MODES.map((m) => {
            const active = value.mode === m.id
            return (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setMode(m.id)}
                className={`rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-200 ${active ? 'bg-white text-emerald-800 shadow-sm ring-1 ring-emerald-200' : 'text-slate-500 hover:text-slate-800'}`}
              >
                {m.label}
              </button>
            )
          })}
        </div>

        <button
          type="button"
          onClick={onExport}
          disabled={exporting || invalidPeriod}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-60"
        >
          <Download size={16} aria-hidden="true" />
          {exporting ? 'Exportando...' : 'Exportar CSV'}
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {fixed ? (
          <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1">
            <button type="button" aria-label="Período anterior" onClick={() => move(-1)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-emerald-800 hover:shadow-sm">
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
            <p className="flex min-w-[12rem] items-center justify-center gap-2 px-2 text-center text-sm font-semibold text-slate-900" aria-live="polite">
              <CalendarDays size={16} className="text-emerald-700" aria-hidden="true" />
              {capitalizeFirst(periodLabel(value.mode, range))}
            </p>
            <button type="button" aria-label="Próximo período" disabled={atPresent} onClick={() => move(1)} className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-white hover:text-emerald-800 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronRight size={18} aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="report-from" className="mb-1 block text-xs font-medium text-slate-500">De</label>
              <input id="report-from" type="date" className="input w-auto" value={value.custom.from} max={value.custom.to || undefined} onChange={(e) => onChange({ custom: { ...value.custom, from: e.target.value } })} />
            </div>
            <div>
              <label htmlFor="report-to" className="mb-1 block text-xs font-medium text-slate-500">Até</label>
              <input id="report-to" type="date" className="input w-auto" value={value.custom.to} min={value.custom.from || undefined} onChange={(e) => onChange({ custom: { ...value.custom, to: e.target.value } })} />
            </div>
          </div>
        )}

        {fixed && !includesToday(range, today) && (
          <button type="button" onClick={() => onChange({ ref: today })} className="rounded-full border border-emerald-300 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-50">
            Voltar para hoje
          </button>
        )}

        <button
          type="button"
          role="switch"
          aria-checked={value.compare}
          onClick={() => onChange({ compare: !value.compare })}
          className="ml-auto inline-flex items-center gap-2.5 rounded-full py-1 pr-1 text-sm text-slate-600"
        >
          <span>Comparar com o período anterior</span>
          <span className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${value.compare ? 'bg-emerald-600' : 'bg-slate-300'}`}>
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${value.compare ? 'left-[1.375rem]' : 'left-0.5'}`} />
          </span>
        </button>
      </div>

      {!fixed && (
        <div className="mt-3 flex flex-wrap gap-2" aria-label="Atalhos de período">
          {PRESETS.map((p) => (
            <button
              key={p.days}
              type="button"
              onClick={() => onChange({ custom: { from: toDay(addDays(fromDay(toDay(today)), -(p.days - 1))), to: toDay(today) } })}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800"
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {invalidPeriod && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">A data inicial não pode ser depois da final.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
        <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Filtrar por</span>
        <Select label="Doador" icon={Store} value={value.donorId} options={donors} onChange={(donorId) => onChange({ donorId })} />
        <Select label="Receptor" icon={HeartHandshake} value={value.recipientId} options={recipients} onChange={(recipientId) => onChange({ recipientId })} />
        {filtersActive > 0 && (
          <button type="button" onClick={() => onChange({ donorId: '', recipientId: '' })} className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-slate-500 hover:text-slate-800">
            <X size={13} aria-hidden="true" /> Limpar filtros
          </button>
        )}
      </div>
    </section>
  )
}
