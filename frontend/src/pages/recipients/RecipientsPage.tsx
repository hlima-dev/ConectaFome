import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { DataTable, type DataTableColumn } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import { ApprovalActions, ApprovalBadge } from '../../components/ApprovalControls'
import { ResetLinkButton } from '../../components/ResetLinkButton'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useDeactivateRecipient, useRecipients } from '../../hooks/useRecipients'
import { RECIPIENT_TYPE_LABELS } from '../../types/auth'
import type { Recipient } from '../../types/recipients'
import { RecipientFormModal } from './RecipientFormModal'
import { getErrorMessage } from '../../utils/errors'

export function RecipientsPage() {
  const [includeInactive, setIncludeInactive] = useState(false)
  const [searchParams] = useSearchParams()
  const [approval, setApproval] = useState(searchParams.get('approval') ?? '')
  const [editingRecipient, setEditingRecipient] = useState<Recipient | null>(null)
  const [creating, setCreating] = useState(false)
  const [deactivating, setDeactivating] = useState<Recipient | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: recipients, isLoading } = useRecipients({ includeInactive, approval: approval || undefined })
  const deactivateRecipient = useDeactivateRecipient()

  async function confirmDeactivate() {
    if (!deactivating) return
    setError(null)
    try {
      await deactivateRecipient.mutateAsync(deactivating.id)
      setDeactivating(null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const columns: DataTableColumn<Recipient>[] = [
    { header: 'Nome', cell: (r) => <span className="font-medium text-slate-900">{r.name}</span> },
    { header: 'Tipo', cell: (r) => RECIPIENT_TYPE_LABELS[r.type] },
    { header: 'Contato', cell: (r) => r.contactName || '—' },
    { header: 'Pessoas atendidas', cell: (r) => r.peopleServed ?? '—' },
    { header: 'Cidade/UF', cell: (r) => (r.city ? `${r.city}${r.state ? '/' + r.state : ''}` : '—') },
    { header: 'Cadastro', cell: (r) => <ApprovalBadge status={r.user?.approvalStatus} /> },
    {
      header: 'Status',
      cell: (r) => <StatusBadge label={r.active ? 'Ativo' : 'Inativo'} tone={r.active ? 'green' : 'neutral'} />,
    },
    {
      header: '',
      className: 'text-right',
      cell: (r) => (
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
          <ResetLinkButton userId={r.userId} name={r.name} />
          <ApprovalActions kind="recipients" id={r.id} name={r.name} status={r.user?.approvalStatus} />
          <button type="button" className="text-slate-500 hover:text-slate-900" onClick={() => setEditingRecipient(r)}>
            Editar
          </button>
          {r.active && (
            <button type="button" className="text-red-600 hover:text-red-800" onClick={() => setDeactivating(r)}>
              Desativar
            </button>
          )}
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Receptores</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <Plus size={16} />
          Novo receptor
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-slate-600">
          Cadastro
          <select className="input w-auto py-1" value={approval} onChange={(e) => setApproval(e.target.value)}>
            <option value="">Todos</option>
            <option value="PENDENTE">Em análise</option>
            <option value="APROVADO">Aprovados</option>
            <option value="REJEITADO">Rejeitados</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
          Incluir inativos
        </label>
      </div>

      {error && <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <DataTable
        columns={columns}
        data={recipients}
        isLoading={isLoading}
        rowKey={(r) => r.id}
        emptyMessage="Nenhum receptor cadastrado."
      />

      {creating && <RecipientFormModal onClose={() => setCreating(false)} />}
      {editingRecipient && <RecipientFormModal recipient={editingRecipient} onClose={() => setEditingRecipient(null)} />}
      {deactivating && (
        <ConfirmDialog
          title="Desativar receptor"
          message={`Tem certeza que deseja desativar "${deactivating.name}"? O histórico de doações é preservado.`}
          confirmLabel="Desativar"
          danger
          isLoading={deactivateRecipient.isPending}
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivating(null)}
        />
      )}
    </div>
  )
}
