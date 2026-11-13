import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { login, saveSession } from '../services/auth'
import { AuthShell } from '../components/AuthShell'
import { getErrorMessage } from '../utils/errors'

const schema = z.object({
  email: z.string().min(1, 'E-mail é obrigatório').email('E-mail inválido'),
  password: z.string().min(1, 'Senha é obrigatória'),
})

type FormValues = z.infer<typeof schema>

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  async function onSubmit(values: FormValues) {
    setFormError(null)
    try {
      const result = await login(values)
      saveSession(result)
      const from = (location.state as { from?: { pathname: string } })?.from?.pathname ?? '/'
      navigate(from, { replace: true })
    } catch (error) {
      setFormError(getErrorMessage(error, 'E-mail ou senha inválidos.'))
    }
  }

  return (
    <AuthShell
      headline="Juntos contra o desperdício de alimentos"
      tagline="Quem doa e quem precisa, conectados em um só fluxo."
      title="Bem-vindo de volta!"
      subtitle="Entre com suas credenciais para continuar."
    >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              E-mail
            </label>
            <input id="email" type="email" autoComplete="username" className="input" {...register('email')} />
            {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Senha
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="input"
              {...register('password')}
            />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
            <p className="mt-2 text-right text-sm">
              <Link to="/esqueci-senha" className="font-medium text-emerald-700 hover:text-emerald-800">
                Esqueci minha senha
              </Link>
            </p>
          </div>

          {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60"
          >
            <LogIn size={16} />
            {isSubmitting ? 'Entrando...' : 'Entrar'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-semibold text-emerald-700 hover:text-emerald-800">
            Cadastre-se
          </Link>
        </p>
    </AuthShell>
  )
}
