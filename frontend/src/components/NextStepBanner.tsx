import { CheckCircle2, Clock, Hand } from 'lucide-react'
import type { NextStep } from '../utils/nextStep'

const STYLE = {
  action: { box: 'border-emerald-300 bg-emerald-50 text-emerald-950', Icon: Hand, label: 'Sua vez' },
  waiting: { box: 'border-slate-200 bg-slate-50 text-slate-800', Icon: Clock, label: 'Em andamento' },
  done: { box: 'border-slate-200 bg-white text-slate-600', Icon: CheckCircle2, label: 'Encerrada' },
} as const

export function NextStepBanner({ step }: { step: NextStep | null }) {
  if (!step) return null
  const { box, Icon, label } = STYLE[step.tone]
  return (
    <div role="status" className={`mb-6 flex items-start gap-3 rounded-xl border p-4 text-sm ${box}`}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <p>
        <span className="mr-2 text-xs font-semibold uppercase tracking-wide opacity-70">{label}</span>
        {step.text}
      </p>
    </div>
  )
}
