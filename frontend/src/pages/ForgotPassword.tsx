import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Mail } from 'lucide-react'
import { AuthShell } from '../components/AuthShell'
import { forgotPassword } from '../services/auth'
import { getErrorMessage } from '../utils/errors'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    setLoading(true)
    try {
      setDone(await forgotPassword(email.trim()))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      headline="Vamos recuperar o seu acesso."
      tagline="Você recebe um link para criar uma senha nova."
      title="Esqueci minha senha"
      subtitle="Informe o e-mail do seu cadastro."
    >
      {done ? (
        <div role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
          <p>{done}</p>
          <p className="mt-2">
            Não chegou? Confira o spam. Se a sua organização não usa e-mail com frequência, peça à administração do ConectaFome para gerar um link e enviar por WhatsApp.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">E-mail</label>
            <input id="email" type="email" required autoComplete="username" className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
            <Mail size={16} /> {loading ? 'Enviando...' : 'Enviar link'}
          </button>
        </form>
      )}
      <p className="mt-5 text-center text-sm text-slate-500">
        <Link to="/login" className="font-semibold text-emerald-700 hover:text-emerald-800">Voltar para o login</Link>
      </p>
    </AuthShell>
  )
}
