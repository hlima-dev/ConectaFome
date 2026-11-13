import { useState } from 'react'
import { KeyRound } from 'lucide-react'
import { Modal } from './Modal'
import { createResetLink } from '../services/auth'
import { getErrorMessage } from '../utils/errors'

// A administração gera o link de nova senha e entrega por WhatsApp: serve para
// quem não usa e-mail. O link vale 1 hora e só uma vez.
export function ResetLinkButton({ userId, name }: { userId: string | null; name: string }) {
  const [link, setLink] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  if (!userId) return null

  async function generate() {
    setError(null)
    setCopied(false)
    try {
      setLink((await createResetLink(userId!)).link)
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function copy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setError('Não foi possível copiar. Selecione o link e copie manualmente.')
    }
  }

  const whats = link ? `https://wa.me/?text=${encodeURIComponent(`ConectaFome: para criar uma nova senha, abra este link (vale por 1 hora): ${link}`)}` : null

  return (
    <>
      <button type="button" className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-900" onClick={generate}>
        <KeyRound size={14} aria-hidden="true" /> Link de senha
      </button>
      {(link || error) && (
        <Modal title={`Nova senha para ${name}`} onClose={() => { setLink(null); setError(null) }}>
          {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {link && (
            <>
              <p className="mb-2 text-sm text-slate-600">Envie este link à pessoa. Ele vale por 1 hora e só pode ser usado uma vez.</p>
              <input readOnly className="input text-xs" value={link} onFocus={(e) => e.currentTarget.select()} aria-label="Link de nova senha" />
              <div className="mt-4 flex flex-wrap justify-end gap-3">
                <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={copy}>
                  {copied ? 'Copiado!' : 'Copiar link'}
                </button>
                <a href={whats!} target="_blank" rel="noreferrer" className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                  Enviar por WhatsApp
                </a>
              </div>
            </>
          )}
        </Modal>
      )}
    </>
  )
}
