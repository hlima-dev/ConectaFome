import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { AuthShell } from '../components/AuthShell'
import { resetPassword } from '../services/auth'
import { getErrorMessage } from '../utils/errors'

const RULES = /^(?=.*[A-Z])(?=.*[0-9]).{8,}$/

export function ResetPassword() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    if (!RULES.test(password)) return setError('A senha precisa ter ao menos 8 caracteres, uma letra maiúscula e um número.')
    if (password !== confirm) return setError('As duas senhas não são iguais.')
    setLoading(true)
    try {
      await resetPassword(token, password)
      setDone(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell headline="Quase lá." tagline="Escolha uma senha nova para voltar a usar o ConectaFome." title="Criar nova senha" subtitle="O link vale por 1 hora e só pode ser usado uma vez.">
      {!token ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Link incompleto. Peça um novo em "Esqueci minha senha".</p>
      ) : done ? (
        <div role="status" className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
          Senha redefinida.{' '}
          <Link to="/login" className="font-semibold underline">Entrar</Link>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">Nova senha</label>
            <input id="password" type="password" autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <label htmlFor="confirm" className="mb-1 block text-sm font-medium text-slate-700">Repita a senha</label>
            <input id="confirm" type="password" autoComplete="new-password" className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
            <KeyRound size={16} /> {loading ? 'Salvando...' : 'Salvar nova senha'}
          </button>
        </form>
      )}
    </AuthShell>
  )
}
