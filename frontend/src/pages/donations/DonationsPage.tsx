import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Plus, Search, X } from 'lucide-react'
import { DataTable, type DataTableColumn } from '../../components/DataTable'
import { StatusBadge } from '../../components/StatusBadge'
import { UrgencyBadge } from '../../components/UrgencyBadge'
import { useDonationsPage } from '../../hooks/useDonations'
import { getStoredUser } from '../../services/auth'
import {
  DONATION_STATUS_LABELS,
  DONATION_STATUS_TONES,
  FOOD_CATEGORY_LABELS,
  type Donation,
  type DonationStatus,
} from '../../types/donations'
import { DonationFormModal } from './DonationFormModal'
import { donationCode, formatKg } from '../../utils/format'

function formatDate(value: string) {
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const PAGE_SIZE = 20

// Lista de doações com busca (texto ou código), status, período, ordem e páginas. Os
// filtros ficam na URL: dá para compartilhar o link de uma busca e os atalhos da
// central de pendências já chegam aqui filtrados.
export function DonationsPage() {
  const user = getStoredUser()
  const canCreate = user?.role === 'ADMIN' || user?.role === 'DOADOR'
  const [searchParams, setSearchParams] = useSearchParams()
  const [creating, setCreating] = useState(false)

  const status = (searchParams.get('status') ?? '') as DonationStatus | ''
  const sort = (searchParams.get('sort') ?? '') as 'prazo' | ''
  const from = searchParams.get('from') ?? ''
  const to = searchParams.get('to') ?? ''
  const q = searchParams.get('q') ?? ''
  const page = Math.max(1, Number(searchParams.get('page')) || 1)

  // O texto digitado só vira filtro depois de uma pausa curta (evita uma consulta por tecla).
  const [text, setText] = useState(q)
  useEffect(() => {
    if (text === q) return
    const timer = setTimeout(() => update({ q: text }), 350)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- update depende só dos parâmetros da URL
  }, [text])

  function update(changes: Record<string, string>) {
    const next = new URLSearchParams(searchParams)
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    if (!('page' in changes)) next.delete('page')
    setSearchParams(next, { replace: true })
  }

  const { data, isLoading, isError } = useDonationsPage({
    status: status || undefined,
    q: q || undefined,
    from: from || undefined,
    to: to || undefined,
    sort: sort || undefined,
    page,
    limit: PAGE_SIZE,
  })
  const donations = data?.data
  const meta = data?.meta
  const hasFilters = !!(status || q || from || to || sort)

  const columns: DataTableColumn<Donation>[] = [
    { header: 'Código', cell: (d) => <span className="whitespace-nowrap font-mono text-xs text-slate-500">{donationCode(d.number)}</span> },
    {
      header: 'Descrição',
      cell: (d) => (
        <Link to={`/doacoes/${d.id}`} className="font-medium text-emerald-700 hover:underline">
          {d.description}
        </Link>
      ),
    },
    { header: 'Categoria', cell: (d) => FOOD_CATEGORY_LABELS[d.category] },
    { header: 'Doador', cell: (d) => d.donor?.name ?? '—' },
    { header: 'Receptor', cell: (d) => d.recipient?.name ?? '—' },
    { header: 'Qtd. estimada', cell: (d) => formatKg(d.estimatedQuantityKg) },
    { header: 'Janela de coleta', cell: (d) => formatDate(d.pickupWindowStart) },
    {
      header: 'Status',
      cell: (d) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge label={DONATION_STATUS_LABELS[d.status]} tone={DONATION_STATUS_TONES[d.status]} />
          <UrgencyBadge urgency={d.urgency} />
        </div>
      ),
    },
  ]

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Doações</h1>
        {canCreate && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
          >
            <Plus size={16} />
            Nova doação
          </button>
        )}
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="relative sm:col-span-2">
          <label htmlFor="donation-search" className="mb-1 block text-xs text-slate-500">Buscar</label>
          <Search size={16} className="pointer-events-none absolute bottom-2.5 left-3 text-slate-400" aria-hidden="true" />
          <input
            id="donation-search"
            type="search"
            className="input pl-9"
            placeholder={user?.role === 'DOADOR' ? 'Descrição ou código (DOA-00042)' : 'Descrição, doador, receptor ou código'}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="donation-status-filter" className="mb-1 block text-xs text-slate-500">Status</label>
          <select id="donation-status-filter" className="input" value={status} onChange={(e) => update({ status: e.target.value })}>
            <option value="">Todos</option>
            {Object.entries(DONATION_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="donation-from" className="mb-1 block text-xs text-slate-500">Registrada de</label>
          <input id="donation-from" type="date" className="input" value={from} max={to || undefined} onChange={(e) => update({ from: e.target.value })} />
        </div>
        <div>
          <label htmlFor="donation-to" className="mb-1 block text-xs text-slate-500">até</label>
          <input id="donation-to" type="date" className="input" value={to} min={from || undefined} onChange={(e) => update({ to: e.target.value })} />
        </div>
        <div>
          <label htmlFor="donation-sort" className="mb-1 block text-xs text-slate-500">Ordem</label>
          <select id="donation-sort" className="input" value={sort} onChange={(e) => update({ sort: e.target.value })}>
            <option value="">Mais recentes</option>
            <option value="prazo">Vence primeiro</option>
          </select>
        </div>
      </div>

      {hasFilters && (
        <button
          type="button"
          onClick={() => {
            setText('')
            setSearchParams({}, { replace: true })
          }}
          className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <X size={14} aria-hidden="true" /> Limpar filtros
        </button>
      )}

      {isError && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Não foi possível carregar as doações. Confira os filtros e tente de novo.</p>}

      <DataTable
        columns={columns}
        data={donations}
        isLoading={isLoading}
        rowKey={(d) => d.id}
        emptyMessage={hasFilters ? 'Nenhuma doação com esses filtros.' : 'Nenhuma doação encontrada.'}
      />

      {meta && meta.total > 0 && (
        <nav className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600" aria-label="Paginação">
          <p>
            {(meta.page - 1) * meta.limit + 1}–{Math.min(meta.page * meta.limit, meta.total)} de {meta.total} doação(ões)
          </p>
          <div className="flex items-center gap-2">
            <button type="button" disabled={!meta.hasPrev} onClick={() => update({ page: String(page - 1) })} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">
              <ChevronLeft size={14} aria-hidden="true" /> Anterior
            </button>
            <span>Página {meta.page} de {meta.totalPages}</span>
            <button type="button" disabled={!meta.hasNext} onClick={() => update({ page: String(page + 1) })} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 hover:bg-slate-50 disabled:opacity-40">
              Próxima <ChevronRight size={14} aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}

      {creating && <DonationFormModal onClose={() => setCreating(false)} />}
    </div>
  )
}
