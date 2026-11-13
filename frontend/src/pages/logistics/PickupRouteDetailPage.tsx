import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { FailStopModal } from '../../components/FailStopModal'
import { FieldLinkButton } from '../../components/FieldLinkButton'
import { RoutePlanPanel } from '../../components/RoutePlanPanel'
import { StatusBadge } from '../../components/StatusBadge'
import {
  useAttachDonation,
  useCancelRoute,
  useCollectStop,
  useCompleteRoute,
  useDetachDonation,
  useFailStop,
  usePickupRoute,
  useStartRoute,
} from '../../hooks/usePickupRoutes'
import { useDonations } from '../../hooks/useDonations'
import { DONATION_STATUS_LABELS, DONATION_STATUS_TONES, PICKUP_FAILURE_LABELS } from '../../types/donations'
import type { Donation } from '../../types/donations'
import { PICKUP_ROUTE_STATUS_LABELS, PICKUP_ROUTE_STATUS_TONES } from '../../types/logistics'
import { getErrorMessage } from '../../utils/errors'
import { formatKg } from '../../utils/format'

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function PickupRouteDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: route, isLoading, error: fetchError } = usePickupRoute(id)

  const [attachId, setAttachId] = useState('')
  // Quantidades coletadas digitadas (por doação); vazio = vale a estimada.
  const [collected, setCollected] = useState<Record<string, string>>({})
  const [canceling, setCanceling] = useState(false)
  const [failing, setFailing] = useState<Donation | null>(null)
  const [error, setError] = useState<string | null>(null)

  const attachDonation = useAttachDonation(id ?? '')
  const detachDonation = useDetachDonation(id ?? '')
  const startRoute = useStartRoute(id ?? '')
  const completeRoute = useCompleteRoute(id ?? '')
  const cancelRoute = useCancelRoute(id ?? '')
  const collectStop = useCollectStop(id ?? '')
  const failStop = useFailStop(id ?? '')

  // Doações disponíveis pra anexar: já casadas (RESERVADA) e ainda sem
  // rota nenhuma — só faz sentido buscar isso com a rota planejada.
  const { data: reservedDonations } = useDonations(
    { status: 'RESERVADA' },
    { enabled: route?.status === 'PLANEJADA' },
  )
  const attachableDonations = (reservedDonations ?? []).filter((d) => !d.routeId)

  if (fetchError) {
    return (
      <div>
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{getErrorMessage(fetchError)}</p>
        <button
          type="button"
          onClick={() => navigate('/rotas')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          Voltar para rotas
        </button>
      </div>
    )
  }

  if (isLoading || !route) {
    return <p className="text-sm text-slate-500">Carregando...</p>
  }

  const isPlanned = route.status === 'PLANEJADA'
  const isOngoing = route.status === 'EM_ANDAMENTO'
  const isTerminal = route.status === 'CONCLUIDA' || route.status === 'CANCELADA'

  async function runAction(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  // Só envia o que foi digitado e é válido; o resto fica com a quantidade estimada.
  function collectedQuantities() {
    const entries = Object.entries(collected)
      .map(([donationId, value]) => ({ donationId, collectedQuantityKg: Number(value) }))
      .filter((entry) => Number.isFinite(entry.collectedQuantityKg) && entry.collectedQuantityKg > 0)
    return entries.length > 0 ? entries : undefined
  }

  async function handleAttach() {
    if (!attachId) {
      setError('Selecione uma doação para anexar')
      return
    }
    await runAction(() => attachDonation.mutateAsync(attachId))
    setAttachId('')
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/rotas')}
        className="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        Voltar para rotas
      </button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Rota #{route.routeNumber}</h1>
        <div className="flex flex-wrap items-center gap-3">
          {(isPlanned || isOngoing) && <FieldLinkButton routeId={route.id} volunteerName={route.volunteer.name} />}
          <StatusBadge label={PICKUP_ROUTE_STATUS_LABELS[route.status]} tone={PICKUP_ROUTE_STATUS_TONES[route.status]} />
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Veículo</p>
          <p className="text-sm text-slate-800">
            {route.vehicle.plate} — {route.vehicle.model}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Voluntário</p>
          <p className="text-sm text-slate-800">{route.volunteer.name}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Agendada para</p>
          <p className="text-sm text-slate-800">{formatDate(route.scheduledFor)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Saiu / Concluída / Cancelada</p>
          <p className="text-sm text-slate-800">
            {formatDate(route.departedAt)} · {formatDate(route.completedAt)} · {formatDate(route.canceledAt)}
          </p>
        </div>
        {route.notes && (
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Observações</p>
            <p className="text-sm text-slate-800">{route.notes}</p>
          </div>
        )}
      </div>

      {route.plan && route.load && <RoutePlanPanel plan={route.plan} load={route.load} />}

      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Doações anexadas ({route.donations.length})</h2>

        {route.donations.length === 0 && <p className="text-sm text-slate-400">Nenhuma doação anexada ainda.</p>}

        {route.donations.length > 0 && (
          <div className="mb-4 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2">Descrição</th>
                  <th className="py-2">Doador</th>
                  <th className="py-2">Receptor</th>
                  <th className="py-2">Status</th>
                  <th className="py-2">{isOngoing ? 'Kg coletado' : 'Kg'}</th>
                  {(isPlanned || isOngoing) && <th className="py-2 text-right">Ação</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {route.donations.map((donation) => (
                  <tr key={donation.id}>
                    <td className="py-2">{donation.description}</td>
                    <td className="py-2">{donation.donor?.name ?? '—'}</td>
                    <td className="py-2">{donation.recipient?.name ?? '—'}</td>
                    <td className="py-2">
                      <StatusBadge
                        label={DONATION_STATUS_LABELS[donation.status]}
                        tone={DONATION_STATUS_TONES[donation.status]}
                      />
                    </td>
                    <td className="py-2">
                      {isOngoing ? (
                        <input
                          type="number"
                          min="0"
                          step="0.1"
                          aria-label={`Kg coletado de ${donation.description}`}
                          className="input w-24"
                          placeholder={String(donation.estimatedQuantityKg)}
                          value={collected[donation.id] ?? ''}
                          onChange={(e) => setCollected((prev) => ({ ...prev, [donation.id]: e.target.value }))}
                        />
                      ) : (
                        formatKg(donation.collectedQuantityKg ?? donation.estimatedQuantityKg)
                      )}
                    </td>
                    {isPlanned && (
                      <td className="py-2 text-right">
                        <button
                          type="button"
                          className="text-red-600 hover:text-red-800"
                          onClick={() => runAction(() => detachDonation.mutateAsync(donation.id))}
                        >
                          Remover
                        </button>
                      </td>
                    )}
                    {isOngoing && (
                      <td className="py-2 text-right">
                        {donation.status === 'AGENDADA' ? (
                          <div className="flex justify-end gap-3 whitespace-nowrap">
                            <button
                              type="button"
                              disabled={collectStop.isPending}
                              className="font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                              onClick={() =>
                                runAction(() =>
                                  collectStop.mutateAsync({
                                    donationId: donation.id,
                                    quantityKg: collected[donation.id] ? Number(collected[donation.id]) : undefined,
                                  }),
                                )
                              }
                            >
                              Coletada
                            </button>
                            <button type="button" className="text-red-600 hover:text-red-800" onClick={() => setFailing(donation)}>
                              Não coletada
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">Resolvida</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {isPlanned && (
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-4">
            <div className="flex-1">
              <label htmlFor="attach-donation" className="mb-1 block text-sm font-medium text-slate-700">
                Anexar doação reservada
              </label>
              <select
                id="attach-donation"
                className="input"
                value={attachId}
                onChange={(e) => setAttachId(e.target.value)}
              >
                <option value="">Selecione uma doação disponível</option>
                {attachableDonations.map((donation) => (
                  <option key={donation.id} value={donation.id}>
                    {donation.description} — {donation.donor?.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAttach}
              disabled={attachDonation.isPending}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {attachDonation.isPending ? 'Anexando...' : 'Anexar'}
            </button>
          </div>
        )}
      </div>

      {(route.failedDonations?.length ?? 0) > 0 && (
        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="mb-3 text-base font-semibold text-amber-900">Paradas não realizadas ({route.failedDonations!.length})</h2>
          <ul className="divide-y divide-amber-100 text-sm">
            {route.failedDonations!.map((d) => (
              <li key={d.id} className="py-2">
                <p className="font-medium text-slate-900">{d.description} <span className="font-normal text-slate-500">· {d.donor?.name}</span></p>
                <p className="text-amber-900">
                  {d.pickupFailureReason ? PICKUP_FAILURE_LABELS[d.pickupFailureReason] : 'Motivo não informado'}
                  {d.pickupFailureNote ? ` — ${d.pickupFailureNote}` : ''}
                  {' · '}
                  {d.status === 'CANCELADA' ? 'doação cancelada' : d.routeId ? 'em outra rota' : 'volta para reagendar'}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {isPlanned && (
          <>
            <button
              type="button"
              onClick={() => runAction(() => startRoute.mutateAsync())}
              disabled={startRoute.isPending || route.load?.exceeds}
              title={route.load?.exceeds ? 'O peso estimado passa da capacidade do veículo' : undefined}
              className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
            >
              {startRoute.isPending ? 'Iniciando...' : 'Iniciar rota'}
            </button>
            <button
              type="button"
              onClick={() => setCanceling(true)}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Cancelar rota
            </button>
          </>
        )}

        {isOngoing && (
          <button
            type="button"
            onClick={() => runAction(() => completeRoute.mutateAsync(collectedQuantities()))}
            disabled={completeRoute.isPending}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {completeRoute.isPending ? 'Concluindo...' : 'Concluir rota (as paradas ainda abertas viram coletadas)'}
          </button>
        )}

        {isTerminal && <p className="text-sm text-slate-500">Este é um estado final, sem mais ações disponíveis.</p>}
      </div>

      {failing && (
        <FailStopModal
          description={failing.description}
          isLoading={failStop.isPending}
          error={error}
          onClose={() => setFailing(null)}
          onConfirm={async (reason, note) => {
            setError(null)
            try {
              await failStop.mutateAsync({ donationId: failing.id, reason, note: note || undefined })
              setFailing(null)
            } catch (err) {
              setError(getErrorMessage(err))
            }
          }}
        />
      )}

      {canceling && (
        <ConfirmDialog
          title="Cancelar rota"
          message="As doações anexadas voltam a ficar reservadas, sem rota. Confirma o cancelamento?"
          confirmLabel="Cancelar rota"
          danger
          isLoading={cancelRoute.isPending}
          onConfirm={async () => {
            await runAction(() => cancelRoute.mutateAsync())
            setCanceling(false)
          }}
          onCancel={() => setCanceling(false)}
        />
      )}
    </div>
  )
}
