import { useState } from 'react'
import { Smartphone } from 'lucide-react'
import { Modal } from './Modal'
import { createFieldLink, revokeFieldLinks } from '../services/pickupRoutes'
import { getErrorMessage } from '../utils/errors'

// Gera o link que o voluntário abre no celular para registrar as paradas com foto.
export function FieldLinkButton({ routeId, volunteerName }: { routeId: string; volunteerName: string }) {
  const [data, setData] = useState<{ link: string; expiresAt: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [open, setOpen] = useState(false)

  async function generate() {
    setError(null)
    setCopied(false)
    setOpen(true)
    try {
      setData(await createFieldLink(routeId))
    } catch (err) {
      setData(null)
      setError(getErrorMessage(err))
    }
  }

  async function revoke() {
    try {
      await revokeFieldLinks(routeId)
      setData(null)
      setOpen(false)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function copy() {
    if (!data) return
    try {
      await navigator.clipboard.writeText(data.link)
      setCopied(true)
    } catch {
      setError('Não foi possível copiar. Selecione o link e copie manualmente.')
    }
  }

  const whats = data ? `https://wa.me/?text=${encodeURIComponent(`ConectaFome, rota de coleta: abra este link no celular para registrar as coletas com foto: ${data.link}`)}` : '#'

  return (
    <>
      <button type="button" onClick={generate} className="inline-flex items-center gap-2 rounded-lg border border-emerald-700 px-4 py-2 text-sm font-medium text-emerald-800 hover:bg-emerald-50">
        <Smartphone size={16} aria-hidden="true" /> Link para o voluntário
      </button>
      {open && (
        <Modal title={`Link da rota para ${volunteerName}`} onClose={() => setOpen(false)}>
          {error && <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {data && (
            <>
              <p className="mb-2 text-sm text-slate-600">
                O voluntário abre este link no celular, sem cadastro, e registra cada parada com foto. Vale até {new Date(data.expiresAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}.
              </p>
              <input readOnly className="input text-xs" value={data.link} onFocus={(e) => e.currentTarget.select()} aria-label="Link do voluntário" />
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Quem tiver o link age como o voluntário nesta rota. Envie só a ele. Gerar um link novo cancela o anterior.
              </p>
              <div className="mt-4 flex flex-wrap justify-between gap-3">
                <button type="button" className="text-sm text-red-600 hover:text-red-800" onClick={revoke}>Cancelar o link</button>
                <div className="flex gap-3">
                  <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={copy}>{copied ? 'Copiado!' : 'Copiar link'}</button>
                  <a href={whats} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">Enviar por WhatsApp</a>
                </div>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  )
}
