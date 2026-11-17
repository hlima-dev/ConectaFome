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
