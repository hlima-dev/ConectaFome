import { useState } from 'react'
import { Modal } from './Modal'
import { PhotoPicker } from './PhotoPicker'
import { PICKUP_FAILURE_LABELS, type PickupFailureReason } from '../types/donations'

interface Props {
  description: string
  isLoading?: boolean
  error?: string | null
  onConfirm: (reason: PickupFailureReason, note: string, files: File[]) => void
  // Mostra o seletor de fotos (link de campo): foto do local ajuda a comprovar o ocorrido.
  withPhotos?: boolean
  onClose: () => void
}

const REQUEUE: PickupFailureReason[] = ['DOADOR_AUSENTE', 'SEM_ESPACO_NO_VEICULO', 'OUTRO']

// Registra por que uma parada não foi coletada. Doador ausente, falta de espaço
// ou outro motivo devolvem a doação para reagendar; os outros cancelam.
export function FailStopModal({ description, isLoading, error, onConfirm, onClose, withPhotos }: Props) {
  const [reason, setReason] = useState<PickupFailureReason>('DOADOR_AUSENTE')
  const [note, setNote] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const requeues = REQUEUE.includes(reason)

  return (
    <Modal title="Coleta não realizada" onClose={onClose}>
      <p className="mb-3 text-sm text-slate-600">{description}</p>
      <label htmlFor="fail-reason" className="mb-1 block text-sm font-medium text-slate-700">O que aconteceu?</label>
      <select id="fail-reason" className="input" value={reason} onChange={(e) => setReason(e.target.value as PickupFailureReason)}>
        {(Object.keys(PICKUP_FAILURE_LABELS) as PickupFailureReason[]).map((r) => (
          <option key={r} value={r}>{PICKUP_FAILURE_LABELS[r]}</option>
        ))}
      </select>
      <label htmlFor="fail-note" className="mb-1 mt-3 block text-sm font-medium text-slate-700">
        Detalhes {reason === 'OUTRO' ? '' : <span className="font-normal text-slate-400">(opcional)</span>}
      </label>
      <textarea id="fail-note" className="input min-h-20" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
      {withPhotos && (
        <div className="mt-3">
          <PhotoPicker files={files} onChange={setFiles} max={5} label="Foto do local" hint="Opcional. Por exemplo, o portão fechado ou o produto." />
        </div>
      )}
      <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
        {requeues ? 'A doação sai da rota e volta a ficar reservada, para ser incluída em outra rota.' : 'A doação será cancelada e todos os envolvidos são avisados.'}
      </p>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <div className="mt-4 flex justify-end gap-3">
        <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={onClose}>Voltar</button>
        <button
          type="button"
          disabled={isLoading || (reason === 'OUTRO' && !note.trim())}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
          onClick={() => onConfirm(reason, note, files)}
        >
          {isLoading ? 'Registrando...' : 'Registrar'}
        </button>
      </div>
    </Modal>
  )
}
