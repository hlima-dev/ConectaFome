import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import axios from 'axios'
import { BadgeCheck, ShieldX } from 'lucide-react'
import { Logo } from '../components/Logo'
import { formatKg } from '../utils/format'

interface Verified {
  valid: true
  code: string
  description: string
  status: 'COLETADA' | 'ENTREGUE'
  collectedQuantityKg: number | null
  collectedAt: string | null
  confirmedAt: string | null
  donorName: string
  recipientName: string | null
}

const when = (value: string | null) => (value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

// Página pública aberta pelo QR code do comprovante: confirma que ele é verdadeiro,
// mostrando só o essencial (sem endereços nem documentos).
export function VerifyReceipt() {
  const { code = '', signature = '' } = useParams<{ code: string; signature: string }>()
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'ok'; data: Verified } | { kind: 'invalid' }>({ kind: 'loading' })

  useEffect(() => {
    let cancelled = false
    const base = import.meta.env.VITE_API_URL ?? ''
    axios
      .get(`${base}/api/v1/public/receipts/${encodeURIComponent(code)}/${encodeURIComponent(signature)}`, { timeout: 30_000 })
      .then((response) => {
        if (!cancelled) setState({ kind: 'ok', data: response.data.data })
      })
      .catch(() => {
        if (!cancelled) setState({ kind: 'invalid' })
      })
    return () => {
      cancelled = true
    }
  }, [code, signature])

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-emerald-950 px-4 py-3">
        <Link to="/inicio" aria-label="ConectaFome, página inicial"><Logo tone="light" size={26} /></Link>
      </header>
      <main className="mx-auto max-w-lg px-4 py-8">
        {state.kind === 'loading' && <p className="text-sm text-slate-500">Conferindo o comprovante...</p>}

        {state.kind === 'invalid' && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
            <ShieldX size={32} aria-hidden="true" />
            <h1 className="mt-2 text-xl font-semibold">Comprovante não encontrado</h1>
            <p className="mt-1 text-sm">O código ou a assinatura não conferem, ou a doação ainda não foi coletada. Desconfie de documentos que não passam nesta conferência.</p>
          </div>
        )}

        {state.kind === 'ok' && (
          <div className="rounded-xl border border-emerald-200 bg-white p-6">
            <BadgeCheck size={36} className="text-emerald-700" aria-hidden="true" />
            <h1 className="mt-2 text-xl font-semibold text-slate-900">Comprovante autêntico</h1>
            <p className="text-sm text-slate-500">Registrado no ConectaFome sob o código <strong className="text-slate-800">{state.data.code}</strong>.</p>
            <dl className="mt-4 divide-y divide-slate-100 text-sm">
              {[
                ['Alimento', state.data.description],
                ['Quantidade coletada', formatKg(state.data.collectedQuantityKg)],
                ['Doador', state.data.donorName],
                ['Receptor', state.data.recipientName ?? '—'],
                ['Coletada em', when(state.data.collectedAt)],
                ['Recebimento', state.data.status === 'ENTREGUE' ? `confirmado em ${when(state.data.confirmedAt)}` : 'aguardando confirmação'],
              ].map(([label, value]) => (
                <div key={label} className="grid grid-cols-3 gap-2 py-2">
                  <dt className="text-slate-500">{label}</dt>
                  <dd className="col-span-2 text-slate-900">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-xs text-slate-500">Por privacidade, esta página não mostra endereços nem documentos.</p>
          </div>
        )}
      </main>
    </div>
  )
}
