import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, MapPin, Navigation, Phone, Play } from 'lucide-react'
import { Logo } from '../../components/Logo'
import { Modal } from '../../components/Modal'
import { PhotoPicker } from '../../components/PhotoPicker'
import { FailStopModal } from '../../components/FailStopModal'
import { StatusBadge } from '../../components/StatusBadge'
import { collectFieldStop, failFieldStop, finishFieldRoute, getFieldView, startFieldRoute, type FieldDonation, type FieldStop, type FieldView } from '../../services/field'
import { PICKUP_FAILURE_LABELS, STORAGE_CONDITION_LABELS, type PickupFailureReason } from '../../types/donations'
import { getErrorMessage } from '../../utils/errors'
import { formatKg } from '../../utils/format'

const mapsUrl = (stop: FieldStop) => {
  const query = stop.latitude !== null && stop.longitude !== null && !stop.address ? `${stop.latitude},${stop.longitude}` : [stop.address, stop.city].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

const phoneHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`

// Página do voluntário: abre pelo link da rota, no celular, sem cadastro. Mostra as
// paradas em ordem e deixa registrar cada coleta com foto.
export function FieldPage() {
  const { token = '' } = useParams<{ token: string }>()
  const [view, setView] = useState<FieldView | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [collecting, setCollecting] = useState<FieldDonation | null>(null)
  const [failing, setFailing] = useState<FieldDonation | null>(null)

  useEffect(() => {
    let cancelled = false
    getFieldView(token)
      .then((data) => {
        if (!cancelled) setView(data)
      })
      .catch((err) => {
        if (!cancelled) setLoadError(getErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [token])

  async function run(action: () => Promise<FieldView>): Promise<boolean> {
    setBusy(true)
    setError(null)
    try {
      setView(await action())
      return true
    } catch (err) {
      setError(getErrorMessage(err))
      return false
    } finally {
      setBusy(false)
    }
  }

  if (loadError) {
    return (
      <Shell>
        <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-900">
          <p className="font-semibold">Não foi possível abrir a rota.</p>
          <p className="mt-1">{loadError}</p>
        </div>
      </Shell>
    )
  }
  if (!view) return <Shell><p className="text-sm text-slate-500">Carregando a rota...</p></Shell>

  const ongoing = view.route.status === 'EM_ANDAMENTO'
  const openCount = view.stops.flatMap((s) => s.donations).filter((d) => d.status === 'AGENDADA').length
  const done = view.route.status === 'CONCLUIDA'

  return (
    <Shell>
      <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Rota #{view.route.routeNumber}</h1>
            <p className="text-sm text-slate-600">{view.volunteerName} · {view.vehicle.model} ({view.vehicle.plate})</p>
          </div>
          <StatusBadge
            label={{ PLANEJADA: 'Planejada', EM_ANDAMENTO: 'Em andamento', CONCLUIDA: 'Concluída', CANCELADA: 'Cancelada' }[view.route.status]}
            tone={done ? 'green' : ongoing ? 'blue' : view.route.status === 'CANCELADA' ? 'red' : 'neutral'}
          />
        </div>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {view.route.status === 'PLANEJADA' && (
        <button type="button" disabled={busy} onClick={() => run(() => startFieldRoute(token))} className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-4 text-base font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
          <Play size={18} aria-hidden="true" /> Iniciar rota
        </button>
      )}

      {done && (
        <div role="status" className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <CheckCircle2 className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
          <p><strong>Rota concluída.</strong> Obrigado pelo trabalho! Você já pode fechar esta página.</p>
        </div>
      )}

      <ol className="flex flex-col gap-4">
        {view.stops.map((stop) => (
          <li key={stop.sequence} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-800 text-sm font-semibold text-white" aria-label={`Parada ${stop.sequence}`}>{stop.sequence}</span>
              <div className="min-w-0 flex-1">
                <h2 className="font-semibold text-slate-900">{stop.donorName}</h2>
                <p className="flex items-start gap-1.5 text-sm text-slate-600">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                  {[stop.address, stop.city].filter(Boolean).join(', ') || 'Endereço não informado'}
                </p>
                {stop.contactName && <p className="text-sm text-slate-500">Contato: {stop.contactName}</p>}
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={mapsUrl(stop)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                    <Navigation size={14} aria-hidden="true" /> Abrir no mapa
                  </a>
                  {stop.phone && (
                    <a href={phoneHref(stop.phone)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                      <Phone size={14} aria-hidden="true" /> Ligar
                    </a>
                  )}
                </div>
              </div>
            </div>

            <ul className="mt-3 divide-y divide-slate-100 border-t border-slate-100">
              {stop.donations.map((donation) => (
                <li key={donation.id} className="py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-900">{donation.description}</p>
                    <StatusBadge label={donation.status === 'COLETADA' ? 'Coletada' : donation.status === 'AGENDADA' ? 'A coletar' : donation.status} tone={donation.status === 'COLETADA' ? 'green' : 'blue'} />
                  </div>
                  <p className="text-sm text-slate-500">
                    {formatKg(donation.collectedKg ?? donation.estimatedKg)} · {STORAGE_CONDITION_LABELS[donation.storageCondition]}
                    {donation.recipientName ? ` · para ${donation.recipientName}` : ''}
                  </p>
                  {donation.notes && <p className="mt-1 text-sm text-slate-500">Obs.: {donation.notes}</p>}
                  {ongoing && donation.status === 'AGENDADA' && (
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" disabled={busy} onClick={() => setCollecting(donation)} className="rounded-lg bg-emerald-700 px-3 py-3 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">Coletei</button>
                      <button type="button" disabled={busy} onClick={() => setFailing(donation)} className="rounded-lg border border-red-300 px-3 py-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60">Não consegui</button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>

      {view.failed.length > 0 && (
        <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4" aria-label="Paradas não realizadas">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900"><AlertTriangle size={16} aria-hidden="true" /> Não coletadas ({view.failed.length})</h2>
          <ul className="text-sm text-amber-900">
            {view.failed.map((f) => (
              <li key={f.id}>{f.description} ({f.donorName}): {f.reason ? PICKUP_FAILURE_LABELS[f.reason as PickupFailureReason] : 'motivo não informado'}{f.note ? ` — ${f.note}` : ''}</li>
            ))}
          </ul>
        </section>
      )}

      {ongoing && (
        <div className="mt-6">
          <button type="button" disabled={busy || openCount > 0} onClick={() => run(() => finishFieldRoute(token))} className="w-full rounded-xl bg-slate-900 px-4 py-4 text-base font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
            Finalizar rota
          </button>
          {openCount > 0 && <p className="mt-2 text-center text-xs text-slate-500">Falta resolver {openCount} parada(s): marque cada uma como coletada ou não coletada.</p>}
        </div>
      )}

      {collecting && (
        <CollectSheet
          donation={collecting}
          requirePhoto={view.requirePhoto}
          photosEnabled={view.photosEnabled}
          busy={busy}
          error={error}
          onClose={() => setCollecting(null)}
          onConfirm={async (files, kg) => {
            if (await run(() => collectFieldStop(token, collecting.id, files, kg))) setCollecting(null)
          }}
        />
      )}

      {failing && (
        <FailStopModal
          description={failing.description}
          withPhotos={view.photosEnabled}
          isLoading={busy}
          error={error}
          onClose={() => setFailing(null)}
          onConfirm={async (reason, note, files) => {
            if (await run(() => failFieldStop(token, failing.id, reason, note, files))) setFailing(null)
          }}
        />
      )}
    </Shell>
  )
}

function CollectSheet({ donation, requirePhoto, photosEnabled, busy, error, onClose, onConfirm }: {
  donation: FieldDonation
  requirePhoto: boolean
  photosEnabled: boolean
  busy: boolean
  error: string | null
  onClose: () => void
  onConfirm: (files: File[], quantityKg: number | undefined) => void
}) {
  const [files, setFiles] = useState<File[]>([])
  const [kg, setKg] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  function confirm() {
    if (requirePhoto && files.length === 0) {
      setLocalError('Tire ao menos uma foto do que está sendo coletado.')
      return
    }
    const parsed = kg.trim() === '' ? undefined : Number(kg.replace(',', '.'))
    if (parsed !== undefined && !(parsed > 0)) {
      setLocalError('Informe um peso válido, maior que zero.')
      return
    }
    setLocalError(null)
    onConfirm(files, parsed)
  }

  return (
    <Modal title="Confirmar coleta" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">{donation.description}</p>
      {photosEnabled ? (
        <PhotoPicker
          files={files}
          onChange={(f) => { setFiles(f); setLocalError(null) }}
          max={5}
          label="Fotos do que você está levando"
          hint={requirePhoto ? 'Obrigatório. Mostre o alimento e a quantidade.' : 'Opcional.'}
          error={localError}
        />
      ) : (
        localError && <p className="text-sm text-red-600">{localError}</p>
      )}
      <label htmlFor="kg" className="mb-1 mt-4 block text-sm font-medium text-slate-700">
        Peso coletado em kg <span className="font-normal text-slate-400">(se diferente de {formatKg(donation.estimatedKg)})</span>
      </label>
      <input id="kg" inputMode="decimal" className="input" placeholder={String(donation.estimatedKg)} value={kg} onChange={(e) => setKg(e.target.value)} />
      {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-3">
        <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={onClose}>Voltar</button>
        <button type="button" disabled={busy} onClick={confirm} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
          {busy ? 'Enviando...' : 'Confirmar coleta'}
        </button>
      </div>
    </Modal>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-emerald-950 px-4 py-3">
        <Logo tone="light" size={26} />
      </header>
      <main className="mx-auto max-w-xl px-4 py-5">{children}</main>
    </div>
  )
}
