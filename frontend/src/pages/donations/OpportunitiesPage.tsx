import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, MapPin } from 'lucide-react'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { StatusBadge } from '../../components/StatusBadge'
import { photoUrl } from '../../services/photos'
import { UrgencyBadge } from '../../components/UrgencyBadge'
import { formatTimeLeft } from '../../utils/time'
import { useOpportunities, useReserveDonation } from '../../hooks/useDonations'
import { getErrorMessage } from '../../utils/errors'
import { formatKg } from '../../utils/format'
import {
  FOOD_CATEGORY_LABELS,
  STORAGE_CONDITION_LABELS,
  type FoodCategory,
  type Opportunity,
} from '../../types/donations'

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

// Painel do receptor: doações disponíveis, da mais urgente para a menos. O
// receptor vê quem doa e em que cidade; o endereço completo só aparece depois
// da reserva, na tela da doação.
export function OpportunitiesPage() {
  const [city, setCity] = useState('')
  const [category, setCategory] = useState<FoodCategory | ''>('')
  const [reserving, setReserving] = useState<Opportunity | null>(null)
  const [message, setMessage] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)

  const filters = { city: city.trim() || undefined, category: category || undefined }
  const { data: opportunities, isLoading } = useOpportunities(filters)
  const reserve = useReserveDonation()

  async function confirmReserve() {
    if (!reserving) return
    setMessage(null)
    try {
      await reserve.mutateAsync(reserving.id)
      setMessage({ tone: 'ok', text: `“${reserving.description}” foi reservada para você. Acompanhe em Doações.` })
    } catch (error) {
      setMessage({ tone: 'error', text: getErrorMessage(error) })
    } finally {
      setReserving(null)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">Oportunidades</h1>
      <p className="mb-4 mt-1 text-sm text-slate-500">
        Doações disponíveis agora, das mais urgentes para as menos. Reserve as que a sua instituição consegue buscar a tempo.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="opp-city" className="mb-1 block text-sm text-slate-600">
            Cidade do doador
          </label>
          <input id="opp-city" className="input" placeholder="Ex: Sorocaba" value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div>
          <label htmlFor="opp-category" className="mb-1 block text-sm text-slate-600">
            Categoria
          </label>
          <select
            id="opp-category"
            className="input"
            value={category}
            onChange={(e) => setCategory(e.target.value as FoodCategory | '')}
          >
            <option value="">Todas</option>
            {Object.entries(FOOD_CATEGORY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {message && (
        <p
          role="status"
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${
            message.tone === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.text}{' '}
          {message.tone === 'ok' && (
            <Link to="/doacoes" className="font-medium underline">
              Ver minhas doações
            </Link>
          )}
        </p>
      )}

      {isLoading && (
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={16} className="animate-spin" /> Carregando oportunidades...
        </p>
      )}

      {!isLoading && opportunities?.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          Nenhuma doação disponível com esses filtros no momento.
        </div>
      )}

      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {opportunities?.map((opportunity) => (
          <li key={opportunity.id} className="flex flex-col gap-3 overflow-hidden rounded-xl border border-slate-200 bg-white p-5">
            {opportunity.photos?.[0] && (
              <img
                src={photoUrl(opportunity.id, opportunity.photos[0].id)}
                alt={`Foto de ${opportunity.description}`}
                loading="lazy"
                className="-mx-5 -mt-5 mb-1 aspect-[16/9] w-[calc(100%+2.5rem)] max-w-none object-cover"
              />
            )}
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="font-semibold text-slate-900">{opportunity.description}</h2>
                <p className="text-sm text-slate-500">
                  {FOOD_CATEGORY_LABELS[opportunity.category]} · {formatKg(opportunity.estimatedQuantityKg)}
                </p>
              </div>
              <UrgencyBadge urgency={opportunity.urgency} />
            </div>

            <p className="flex items-center gap-1.5 text-sm text-slate-700">
              <MapPin size={14} className="text-slate-400" />
              {opportunity.donor.name}
              {opportunity.donor.city ? ` · ${opportunity.donor.city}${opportunity.donor.state ? `/${opportunity.donor.state}` : ''}` : ''}
            </p>

            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-400">Coleta até</dt>
              <dd className="text-slate-800">{formatDateTime(opportunity.pickupWindowEnd)}</dd>
              <dt className="text-slate-400">Armazenamento</dt>
              <dd className="text-slate-800">
                <StatusBadge
                  label={STORAGE_CONDITION_LABELS[opportunity.storageCondition]}
                  tone={opportunity.storageCondition === 'AMBIENTE' ? 'neutral' : 'blue'}
                />
              </dd>
              {opportunity.urgency && (
                <>
                  <dt className="text-slate-400">Tempo restante</dt>
                  <dd className="text-slate-800">{formatTimeLeft(opportunity.urgency.hoursLeft)}</dd>
                </>
              )}
            </dl>

            <button
              type="button"
              onClick={() => setReserving(opportunity)}
              className="mt-auto self-start rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
            >
              Reservar
            </button>
          </li>
        ))}
      </ul>

      {reserving && (
        <ConfirmDialog
          title="Reservar doação"
          message={`Reservar “${reserving.description}” (${formatKg(reserving.estimatedQuantityKg)}) para a sua instituição? A coleta é combinada pela administração; se não puder buscar, libere a reserva na tela da doação.`}
          confirmLabel="Reservar"
          isLoading={reserve.isPending}
          onConfirm={confirmReserve}
          onCancel={() => setReserving(null)}
        />
      )}
    </div>
  )
}
