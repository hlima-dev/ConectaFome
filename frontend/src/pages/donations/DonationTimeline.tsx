import { StatusBadge } from '../../components/StatusBadge'
import {
  DONATION_ACTION_LABELS,
  DONATION_STATUS_LABELS,
  DONATION_STATUS_TONES,
  type DonationEvent,
} from '../../types/donations'

const ROLE_LABELS = { ADMIN: 'Administração', DOADOR: 'Doador', RECEPTOR: 'Receptor' } as const

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// Linha do tempo da doação: cada passo com quem executou e quando. Doações
// anteriores ao histórico não têm eventos — mostramos isso em vez de uma
// lista vazia sem explicação.
export function DonationTimeline({ events }: { events: DonationEvent[] }) {
  if (events.length === 0) {
    return <p className="text-sm text-slate-500">Nenhum registro no histórico desta doação.</p>
  }

  return (
    <ol className="relative ml-2 border-l border-slate-200">
      {events.map((event) => (
        <li key={event.id} className="mb-5 ml-5 last:mb-0">
          <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full border-2 border-white bg-emerald-600" />
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-slate-900">{DONATION_ACTION_LABELS[event.action]}</p>
            <StatusBadge label={DONATION_STATUS_LABELS[event.toStatus]} tone={DONATION_STATUS_TONES[event.toStatus]} />
          </div>
          <p className="text-xs text-slate-500">
            {formatDateTime(event.createdAt)} ·{' '}
            {event.actor
              ? `${event.actor.name} (${ROLE_LABELS[event.actor.role]})`
              : event.actorLabel ?? 'Sistema (automático)'}
          </p>
          {event.detail && <p className="mt-0.5 text-xs text-amber-800">{event.detail}</p>}
        </li>
      ))}
    </ol>
  )
}
