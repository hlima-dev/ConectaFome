import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Clock, ImageOff, PackageCheck, RefreshCw, Route, UserCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePending, useRunMaintenance } from '../hooks/useReports'
import { formatTimeLeft } from '../utils/time'
import type { PendingDonation } from '../types/pending'

const waited = (hours: number | null | undefined) => {
  if (hours === null || hours === undefined) return ''
  return hours >= 48 ? `há ${Math.floor(hours / 24)} dias` : `há ${Math.round(hours)} h`
}

interface GroupProps {
  icon: LucideIcon
  tone: 'red' | 'amber' | 'blue'
  title: string
  help: string
  count: number
  to: string
  linkLabel: string
  children: React.ReactNode
}

const TONES = {
  red: 'border-red-200 bg-red-50 text-red-800',
  amber: 'border-amber-200 bg-amber-50 text-amber-900',
  blue: 'border-blue-200 bg-blue-50 text-blue-900',
}

function Group({ icon: Icon, tone, title, help, count, to, linkLabel, children }: GroupProps) {
  if (count === 0) return null
  return (
    <section className={`rounded-xl border p-4 ${TONES[tone]}`} aria-label={title}>
      <div className="flex items-start gap-3">
        <Icon size={20} className="mt-0.5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">
            {title} <span className="ml-1 rounded-full bg-white/70 px-2 py-0.5 text-xs">{count}</span>
          </h3>
          <p className="text-xs opacity-80">{help}</p>
          <ul className="mt-2 space-y-1 text-sm">{children}</ul>
          <Link to={to} className="mt-2 inline-block text-xs font-semibold underline">
            {linkLabel}
          </Link>
        </div>
      </div>
    </section>
  )
}

const donationLine = (d: PendingDonation, extra?: string) => (
  <li key={d.id} className="truncate">
    <Link to={`/doacoes/${d.id}`} className="font-medium hover:underline">
      {d.code} · {d.description}
    </Link>
    <span className="opacity-80"> · {d.donorName}{extra ? ` · ${extra}` : ''}</span>
  </li>
)

// "O que precisa de ação agora" para a administração: cada grupo só aparece quando
// há algo a fazer, com os itens mais antigos ou urgentes e o caminho para resolver.
export function PendingPanel() {
  const { data, isLoading, isError } = usePending()
  const maintenance = useRunMaintenance()

  if (isLoading) return <p className="mt-6 text-sm text-slate-400">Verificando pendências...</p>
  if (isError || !data) return null

  return (
    <section className="mt-6" aria-labelledby="pendencias-titulo">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 id="pendencias-titulo" className="text-lg font-semibold text-slate-900">
          Precisa de atenção {data.total > 0 && <span className="ml-1 rounded-full bg-red-600 px-2 py-0.5 text-xs font-semibold text-white">{data.total}</span>}
        </h2>
        <button
          type="button"
          onClick={() => maintenance.mutate()}
          disabled={maintenance.isPending}
          title="Marca como vencidas as doações fora do prazo e solta reservas paradas. Isso também roda sozinho a cada 15 minutos."
          className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw size={14} className={maintenance.isPending ? 'animate-spin' : ''} aria-hidden="true" />
          Verificar prazos agora
        </button>
      </div>

      {maintenance.data && (
        <p role="status" className="mb-3 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700">
          Verificação feita: {maintenance.data.expired} doação(ões) marcada(s) como vencida(s) e {maintenance.data.released} reserva(s) devolvida(s) ao painel.
        </p>
      )}

      {data.total === 0 && data.routesToday.count === 0 ? (
        <p role="status" className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 size={18} aria-hidden="true" /> Tudo em dia: nenhuma pendência no momento.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          <Group icon={UserCheck} tone="amber" title="Cadastros aguardando aprovação" help="Só depois de aprovados eles podem doar ou reservar." count={data.approvals.count} to="/receptores?approval=PENDENTE" linkLabel="Conferir cadastros">
            {data.approvals.items.map((a) => (
              <li key={a.id} className="truncate">
                <Link to={a.kind === 'donor' ? '/doadores?approval=PENDENTE' : '/receptores?approval=PENDENTE'} className="font-medium hover:underline">{a.name}</Link>
                <span className="opacity-80"> · {a.kind === 'donor' ? 'doador' : 'receptor'} {waited(a.waitingHours)}</span>
              </li>
            ))}
          </Group>

          <Group icon={AlertTriangle} tone="red" title="Urgentes sem reserva" help="Vencem em menos de 24 h e ninguém reservou ainda." count={data.urgentAvailable.count} to="/doacoes?status=DISPONIVEL&sort=prazo" linkLabel="Ver disponíveis por prazo">
            {data.urgentAvailable.items.map((d) => donationLine(d, d.hoursLeft !== undefined ? formatTimeLeft(d.hoursLeft) : undefined))}
          </Group>

          <Group icon={Route} tone="blue" title="Reservadas sem rota" help="Já têm receptor, mas ainda não entraram em uma rota de coleta." count={data.reservedWithoutRoute.count} to="/doacoes?status=RESERVADA&sort=prazo" linkLabel="Ver reservadas">
            {data.reservedWithoutRoute.items.map((d) => donationLine(d, d.recipientName ? `${d.recipientName} ${waited(d.waitingHours)}` : undefined))}
          </Group>

          <Group icon={PackageCheck} tone="amber" title="Coletadas sem confirmação" help="Coletadas há mais de 24 h e o receptor ainda não confirmou o recebimento." count={data.awaitingConfirmation.count} to="/doacoes?status=COLETADA" linkLabel="Ver coletadas">
            {data.awaitingConfirmation.items.map((d) => donationLine(d, d.recipientName ? `${d.recipientName} ${waited(d.waitingHours)}` : undefined))}
          </Group>

          <Group icon={Clock} tone="red" title="Agendadas com prazo vencido" help="Estão em uma rota, mas o prazo passou. Decida se ainda vale coletar." count={data.overdueScheduled.count} to="/doacoes?status=AGENDADA" linkLabel="Ver agendadas">
            {data.overdueScheduled.items.map((d) => donationLine(d))}
          </Group>

          <Group icon={ImageOff} tone="amber" title="Disponíveis sem foto" help="Sem foto da oferta, os receptores não conseguem reservar." count={data.withoutPhoto.count} to="/doacoes?status=DISPONIVEL" linkLabel="Ver disponíveis">
            {data.withoutPhoto.items.map((d) => donationLine(d))}
          </Group>

          <Group icon={Route} tone="blue" title="Rotas de hoje" help="Planejadas ou em andamento, agendadas para hoje ou antes." count={data.routesToday.count} to="/rotas" linkLabel="Ver rotas">
            {data.routesToday.items.map((r) => (
              <li key={r.id} className="truncate">
                <Link to={`/rotas/${r.id}`} className="font-medium hover:underline">Rota #{r.routeNumber}</Link>
                <span className="opacity-80"> · {r.volunteerName} · {r.status === 'EM_ANDAMENTO' ? 'em andamento' : 'planejada'}</span>
              </li>
            ))}
          </Group>
        </div>
      )}
    </section>
  )
}
