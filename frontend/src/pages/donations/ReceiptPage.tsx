import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { useDonationReceipt } from '../../hooks/useDonations'
import { FOOD_CATEGORY_LABELS, STORAGE_CONDITION_LABELS } from '../../types/donations'
import { getErrorMessage } from '../../utils/errors'
import { ReceiptQr } from '../../components/ReceiptQr'

const formatDateTime = (value: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—'

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-slate-100 py-2 text-sm last:border-b-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 text-slate-900">{children}</dd>
    </div>
  )
}

// Comprovante imprimível (o botão usa a impressão do navegador, que também
// salva em PDF). A barra lateral e o cabeçalho do app somem na impressão.
export function ReceiptPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: receipt, isLoading, error } = useDonationReceipt(id)

  if (error) {
    return (
      <div>
        <p role="alert" className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {getErrorMessage(error)}
        </p>
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={16} /> Voltar
        </button>
      </div>
    )
  }
  if (isLoading || !receipt) return <p className="text-sm text-slate-500">Carregando comprovante...</p>

  const d = receipt.donation

  return (
    <div>
      <div className="mb-4 flex items-center justify-between print:hidden">
        <button type="button" onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft size={16} /> Voltar
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
        >
          <Printer size={16} /> Imprimir / salvar em PDF
        </button>
      </div>

      <article className="mx-auto max-w-2xl rounded-xl border border-slate-200 bg-white p-8 print:border-0 print:p-0">
        <header className="mb-6 border-b border-slate-200 pb-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">ConectaFome</p>
          <h1 className="text-2xl font-semibold text-slate-900">Comprovante de doação de alimentos</h1>
          <p className="mt-1 text-sm text-slate-500">
            Nº <strong className="text-slate-800">{receipt.number}</strong> · emitido em {formatDateTime(receipt.issuedAt)}
          </p>
        </header>

        <section className="mb-5">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Doador</h2>
          <dl>
            <Row label="Nome">{receipt.donor.name}</Row>
            <Row label="Documento">{receipt.donor.document ?? '—'}</Row>
            <Row label="Endereço">{receipt.donor.address ?? '—'}</Row>
          </dl>
        </section>

        <section className="mb-5">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Receptor</h2>
          <dl>
            <Row label="Nome">{receipt.recipient?.name ?? '—'}</Row>
            <Row label="Documento">{receipt.recipient?.document ?? '—'}</Row>
            <Row label="Endereço">{receipt.recipient?.address ?? '—'}</Row>
          </dl>
        </section>

        <section className="mb-5">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Alimento</h2>
          <dl>
            <Row label="Descrição">{d.description}</Row>
            <Row label="Categoria">{FOOD_CATEGORY_LABELS[d.category]}</Row>
            <Row label="Armazenamento">{STORAGE_CONDITION_LABELS[d.storageCondition]}</Row>
            <Row label="Quantidade estimada">{d.estimatedQuantityKg.toLocaleString('pt-BR')} kg</Row>
            <Row label="Quantidade coletada">
              <strong>{d.collectedQuantityKg === null ? '—' : `${d.collectedQuantityKg.toLocaleString('pt-BR')} kg`}</strong>
            </Row>
            <Row label="Validade">{d.bestBeforeDate ? new Date(d.bestBeforeDate).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—'}</Row>
          </dl>
        </section>

        <section className="mb-6">
          <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-slate-400">Datas</h2>
          <dl>
            <Row label="Registrada">{formatDateTime(d.registeredAt)}</Row>
            <Row label="Declaração do doador">{d.termsAcceptedAt ? `Próprio para consumo, em ${formatDateTime(d.termsAcceptedAt)}` : '—'}</Row>
            <Row label="Coletada">{formatDateTime(d.collectedAt)}</Row>
            <Row label="Recebimento confirmado">{formatDateTime(d.confirmedAt)}</Row>
          </dl>
        </section>

        <section className="mb-6 rounded-lg border border-slate-200 p-4" aria-label="Conferência de autenticidade">
          <ReceiptQr code={receipt.verification.code} signature={receipt.verification.signature} />
        </section>

        <footer className="border-t border-slate-200 pt-4 text-xs text-slate-500">
          Documento gerado pelo sistema ConectaFome para registro e prestação de contas. Não substitui nota fiscal, recibo ou
          outro documento exigido pela legislação aplicável.
        </footer>
      </article>
    </div>
  )
}
