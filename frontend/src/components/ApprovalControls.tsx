import { useState } from 'react'
import { Check, X } from 'lucide-react'
import { StatusBadge } from './StatusBadge'
import { Modal } from './Modal'
import { useSetApproval } from '../hooks/useApproval'
import { APPROVAL_LABELS, type ApprovalStatus } from '../types/auth'
import { getErrorMessage } from '../utils/errors'

const TONES = { PENDENTE: 'amber', APROVADO: 'green', REJEITADO: 'red' } as const

export function ApprovalBadge({ status }: { status?: ApprovalStatus | null }) {
  if (!status) return <span className="text-slate-400">—</span>
  return <StatusBadge label={APPROVAL_LABELS[status]} tone={TONES[status]} />
}

interface Props {
  kind: 'donors' | 'recipients'
  id: string
  name: string
  status?: ApprovalStatus | null
}

// Aprovar / rejeitar um cadastro. Rejeitar pede o motivo, que vai para o usuário.
export function ApprovalActions({ kind, id, name, status }: Props) {
  const [rejecting, setRejecting] = useState(false)
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const mutation = useSetApproval(kind)

  if (!status) return null

  async function run(next: ApprovalStatus, text?: string) {
    setError(null)
    try {
      await mutation.mutateAsync({ id, status: next, note: text })
      setRejecting(false)
      setNote('')
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <>
      {status !== 'APROVADO' && (
        <button
          type="button"
          disabled={mutation.isPending}
          className="inline-flex items-center gap-1 font-medium text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
          onClick={() => run('APROVADO')}
        >
          <Check size={14} aria-hidden="true" /> Aprovar
        </button>
      )}
      {status !== 'REJEITADO' && (
        <button type="button" className="inline-flex items-center gap-1 text-red-600 hover:text-red-800" onClick={() => setRejecting(true)}>
          <X size={14} aria-hidden="true" /> Rejeitar
        </button>
      )}
      {error && !rejecting && <span className="text-xs text-red-600">{error}</span>}

      {rejecting && (
        <Modal title={`Rejeitar cadastro de ${name}`} onClose={() => setRejecting(false)}>
          <label htmlFor="approval-note" className="mb-1 block text-sm font-medium text-slate-700">
            Motivo <span className="font-normal text-slate-400">(a pessoa recebe este texto)</span>
          </label>
          <textarea id="approval-note" className="input min-h-24" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={() => setRejecting(false)}>
              Cancelar
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60"
              onClick={() => run('REJEITADO', note)}
            >
              Rejeitar cadastro
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
