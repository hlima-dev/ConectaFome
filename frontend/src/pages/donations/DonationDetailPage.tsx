import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { Modal } from '../../components/Modal'
import { StatusBadge } from '../../components/StatusBadge'
import { UrgencyBadge } from '../../components/UrgencyBadge'
import { formatTimeLeft } from '../../utils/time'
import {
  useCancelDonation,
  useConfirmReceiptDonation,
  useDonation,
  useDonationEvents,
  useMarkExpiredDonation,
  useMatchDonation,
  useReleaseDonation,
} from '../../hooks/useDonations'
import { useRecipients } from '../../hooks/useRecipients'
import { getStoredUser } from '../../services/auth'
import { getErrorMessage } from '../../utils/errors'
import { DonationTimeline } from './DonationTimeline'
import { DonationPhotos } from '../../components/DonationPhotos'
import { formatKg } from '../../utils/format'
import {
  DONATION_STATUS_LABELS,
  DONATION_STATUS_TONES,
  FOOD_CATEGORY_LABELS,
  STORAGE_CONDITION_LABELS,
} from '../../types/donations'

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function MatchModal({ donationId, onClose }: { donationId: string; onClose: () => void }) {
  const [recipientId, setRecipientId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const { data: recipients, isLoading } = useRecipients()
  const matchDonation = useMatchDonation(donationId)

  async function handleSubmit() {
    if (!recipientId) {
      setError('Selecione um receptor')
      return
    }
    setError(null)
    try {
      await matchDonation.mutateAsync(recipientId)
      onClose()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <Modal title="Casar doação com um receptor" onClose={onClose}>
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor="match-recipientId" className="mb-1 block text-sm font-medium text-slate-700">
            Receptor
          </label>
          <select
            id="match-recipientId"
            className="input"
            value={recipientId}
            onChange={(e) => setRecipientId(e.target.value)}
            disabled={isLoading}
          >
            <option value="">Selecione o receptor</option>
            {recipients?.map((recipient) => (
              <option key={recipient.id} value={recipient.id}>
                {recipient.name}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <div className="mt-2 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={matchDonation.isPending}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {matchDonation.isPending ? 'Salvando...' : 'Confirmar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

export function DonationDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const user = getStoredUser()
  const { data: donation, isLoading, error: fetchError } = useDonation(id)
  const { data: events, isLoading: eventsLoading } = useDonationEvents(id)

  const [matching, setMatching] = useState(false)
  const [canceling, setCanceling] = useState(false)
  const [expiring, setExpiring] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cancelDonation = useCancelDonation(id ?? '')
  const markExpired = useMarkExpiredDonation(id ?? '')
  const confirmReceipt = useConfirmReceiptDonation(id ?? '')
  const releaseReservation = useReleaseDonation(id ?? '')

  if (fetchError) {
    return (
      <div>
        <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{getErrorMessage(fetchError)}</p>
        <button
          type="button"
          onClick={() => navigate('/doacoes')}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft size={16} />
          Voltar para doações
        </button>
      </div>
    )
  }

  if (isLoading || !donation) {
    return <p className="text-sm text-slate-500">Carregando...</p>
  }

  const isAdmin = user?.role === 'ADMIN'
  const isOwnerDonor = user?.role === 'DOADOR' && user.donorProfile?.id === donation.donorId
  const isOwnerRecipient = user?.role === 'RECEPTOR' && user.recipientProfile?.id === donation.recipientId

  const canManageAsDonor = isAdmin || isOwnerDonor
  const canManageAsRecipient = isAdmin || isOwnerRecipient

  const canCancelOrExpire = canManageAsDonor && ['DISPONIVEL', 'RESERVADA'].includes(donation.status)
  const canMatch = isAdmin && ['DISPONIVEL', 'RESERVADA'].includes(donation.status)
  const canIssueReceipt = canManageAsDonor && ['COLETADA', 'ENTREGUE'].includes(donation.status)
  const canRelease = canManageAsRecipient && donation.status === 'RESERVADA'
  const canConfirmReceipt = canManageAsRecipient && donation.status === 'COLETADA'
  const isTerminal = ['ENTREGUE', 'CANCELADA', 'VENCIDA'].includes(donation.status)

  async function handleCancel() {
    setError(null)
    try {
      await cancelDonation.mutateAsync()
      setCanceling(false)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function handleExpire() {
    setError(null)
    try {
      await markExpired.mutateAsync()
      setExpiring(false)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function handleRelease() {
    setError(null)
    try {
      await releaseReservation.mutateAsync()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function handleConfirmReceipt() {
    setError(null)
    try {
      await confirmReceipt.mutateAsync()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => navigate('/doacoes')}
        className="mb-4 flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft size={16} />
        Voltar para doações
      </button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">{donation.description}</h1>
          <p className="text-sm text-slate-500">{FOOD_CATEGORY_LABELS[donation.category]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <UrgencyBadge urgency={donation.urgency} />
          <StatusBadge label={DONATION_STATUS_LABELS[donation.status]} tone={DONATION_STATUS_TONES[donation.status]} />
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-white p-5 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Doador</p>
          <p className="text-sm text-slate-800">{donation.donor?.name ?? '—'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Receptor</p>
          <p className="text-sm text-slate-800">{donation.recipient?.name ?? '— (ainda não casada)'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quantidade estimada</p>
          <p className="text-sm text-slate-800">{formatKg(donation.estimatedQuantityKg)}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Quantidade coletada</p>
          <p className="text-sm text-slate-800">
            {formatKg(donation.collectedQuantityKg)}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Janela de coleta</p>
          <p className="text-sm text-slate-800">
            {formatDate(donation.pickupWindowStart)} até {formatDate(donation.pickupWindowEnd)}
          </p>
        </div>
        {donation.urgency && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Prazo para coletar</p>
            <p className="text-sm text-slate-800">
              {formatDate(donation.urgency.deadline)}
              {donation.urgency.level !== 'EXPIRED' && ` (restam ${formatTimeLeft(donation.urgency.hoursLeft)})`}
            </p>
          </div>
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Validade</p>
          <p className="text-sm text-slate-800">{donation.bestBeforeDate ? formatDate(donation.bestBeforeDate) : '—'}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Armazenamento até a coleta</p>
          <p className="text-sm text-slate-800">{STORAGE_CONDITION_LABELS[donation.storageCondition]}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Declaração do doador</p>
          <p className="text-sm text-slate-800">
            {donation.termsAcceptedAt
              ? `Próprio para consumo, declarado em ${formatDate(donation.termsAcceptedAt)}`
              : '— (doação anterior à declaração)'}
          </p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Rota de coleta</p>
          <p className="text-sm text-slate-800">
            {donation.route ? `Rota #${donation.route.routeNumber}` : '—'}
          </p>
        </div>
        {donation.notes && (
          <div className="sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Observações</p>
            <p className="text-sm text-slate-800">{donation.notes}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {canMatch && (
          <button
            type="button"
            onClick={() => setMatching(true)}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            {donation.status === 'RESERVADA' ? 'Reatribuir a outro receptor' : 'Casar com receptor'}
          </button>
        )}
        {canIssueReceipt && (
          <Link
            to={`/doacoes/${donation.id}/comprovante`}
            className="rounded-lg border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50"
          >
            Ver comprovante
          </Link>
        )}
        {canRelease && (
          <button
            type="button"
            onClick={handleRelease}
            disabled={releaseReservation.isPending}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {releaseReservation.isPending ? 'Liberando...' : 'Liberar reserva'}
          </button>
        )}
        {canConfirmReceipt && (
          <button
            type="button"
            onClick={handleConfirmReceipt}
            disabled={confirmReceipt.isPending}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
          >
            {confirmReceipt.isPending ? 'Confirmando...' : 'Confirmar recebimento'}
          </button>
        )}
        {canCancelOrExpire && (
          <>
            <button
              type="button"
              onClick={() => setExpiring(true)}
              className="rounded-lg border border-amber-300 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-50"
            >
              Marcar como vencida
            </button>
            <button
              type="button"
              onClick={() => setCanceling(true)}
              className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
            >
              Cancelar doação
            </button>
          </>
        )}
        {donation.status === 'AGENDADA' && (
          <p className="text-sm text-slate-500">
            Doação já agendada numa rota de coleta — aguardando a coleta ser realizada.
          </p>
        )}
        {isTerminal && <p className="text-sm text-slate-500">Este é um estado final, sem mais ações disponíveis.</p>}
      </div>

      <DonationPhotos
        donationId={donation.id}
        canAddOffer={canManageAsDonor && ['DISPONIVEL', 'RESERVADA', 'AGENDADA'].includes(donation.status)}
        canAddDelivery={canManageAsRecipient && ['COLETADA', 'ENTREGUE'].includes(donation.status)}
      />

      <section className="mt-8">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Histórico</h2>
        {eventsLoading ? <p className="text-sm text-slate-500">Carregando histórico...</p> : <DonationTimeline events={events ?? []} />}
      </section>

      {matching && id && <MatchModal donationId={id} onClose={() => setMatching(false)} />}

      {canceling && (
        <ConfirmDialog
          title="Cancelar doação"
          message="Tem certeza que deseja cancelar essa doação? Essa ação não pode ser desfeita."
          confirmLabel="Cancelar doação"
          danger
          isLoading={cancelDonation.isPending}
          onConfirm={handleCancel}
          onCancel={() => setCanceling(false)}
        />
      )}

      {expiring && (
        <ConfirmDialog
          title="Marcar como vencida"
          message="Confirma que essa doação venceu antes de ser coletada?"
          confirmLabel="Marcar como vencida"
          danger
          isLoading={markExpired.isPending}
          onConfirm={handleExpire}
          onCancel={() => setExpiring(false)}
        />
      )}
    </div>
  )
}
