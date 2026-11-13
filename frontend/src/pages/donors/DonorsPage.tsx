import { useState } from 'react'
import { Plus } from 'lucide-react'
import { DataTable, type DataTableColumn } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import { ApprovalActions, ApprovalBadge } from '../../components/ApprovalControls'
import { ConfirmDialog } from '../../components/ConfirmDialog'
import { useDeactivateDonor, useDonors } from '../../hooks/useDonors'
import { DONOR_TYPE_LABELS } from '../../types/auth'
import type { Donor } from '../../types/donors'
import { DonorFormModal } from './DonorFormModal'
import { getErrorMessage } from '../../utils/errors'

export function DonorsPage() {
  const [includeInactive, setIncludeInactive] = useState(false)
  const [approval, setApproval] = useState('')
  const [editingDonor, setEditingDonor] = useState<Donor | null>(null)
  const [creating, setCreating] = useState(false)
  const [deactivating, setDeactivating] = useState<Donor | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: donors, isLoading } = useDonors({ includeInactive, approval: approval || undefined })
  const deactivateDonor = useDeactivateDonor()

  async function confirmDeactivate() {
    if (!deactivating) return
    setError(null)
    try {
      await deactivateDonor.mutateAsync(deactivating.id)
      setDeactivating(null)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const columns: DataTableColumn<Donor>[] = [
    { header: 'Nome', cell: (d) => <span className="font-medium text-slate-900">{d.name}</span> },
    { header: 'Tipo', cell: (d) => DONOR_TYPE_LABELS[d.type] },
    { header: 'Contato', cell: (d) => d.contactName || '—' },
    { header: 'Telefone', cell: (d) => d.phone || '—' },
    { header: 'Cidade/UF', cell: (d) => (d.city ? `${d.city}${d.state ? '/' + d.state : ''}` : '—') },
    { header: 'Cadastro', cell: (d) => <ApprovalBadge status={d.user?.approvalStatus} /> },
    {
      header: 'Status',
      cell: (d) => <StatusBadge label={d.active ? 'Ativo' : 'Inativo'} tone={d.active ? 'green' : 'neutral'} />,
    },
    {
      header: '',
      className: 'text-right',
      cell: (d) => (
        <div className="flex flex-wrap items-center justify-end gap-3 text-sm">
          <ApprovalActions kind="donors" id={d.id} name={d.name} status={d.user?.approvalStatus} />
          <button type="button" className="text-slate-500 hover:text-slate-900" onClick={() => setEditingDonor(d)}>
            Editar
          </button>
          {d.active && (
            <button type="button" className="text-red-600 hover:text-red-800" onClick={() => setDeactivating(d)}>
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
        <h1 className="text-2xl font-semibold text-slate-900">Doadores</h1>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <Plus size={16} />
          Novo doador
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
        data={donors}
        isLoading={isLoading}
        rowKey={(d) => d.id}
        emptyMessage="Nenhum doador cadastrado."
      />

      {creating && <DonorFormModal onClose={() => setCreating(false)} />}
      {editingDonor && <DonorFormModal donor={editingDonor} onClose={() => setEditingDonor(null)} />}
      {deactivating && (
        <ConfirmDialog
          title="Desativar doador"
          message={`Tem certeza que deseja desativar "${deactivating.name}"? O histórico de doações é preservado.`}
          confirmLabel="Desativar"
          danger
          isLoading={deactivateDonor.isPending}
          onConfirm={confirmDeactivate}
          onCancel={() => setDeactivating(null)}
        />
      )}
    </div>
  )
}
