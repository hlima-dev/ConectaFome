import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate } from 'react-router-dom'
import { HeartHandshake, Store, UserPlus } from 'lucide-react'
import { register as registerRequest, saveSession } from '../services/auth'
import { AuthShell } from '../components/AuthShell'
import { getErrorMessage, getFieldErrors } from '../utils/errors'
import { DONOR_TYPE_LABELS, RECIPIENT_TYPE_LABELS } from '../types/auth'
import { isValidDocument, maskDocument } from '../utils/document'

const passwordSchema = z
  .string()
  .min(8, 'Senha deve ter ao menos 8 caracteres')
  .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
  .regex(/[0-9]/, 'Senha deve conter ao menos um número')

// Campos de doador/receptor ficam "soltos" no mesmo schema (em vez de um
// z.discriminatedUnion aninhado) pra manter o formulário simples com RHF —
// só os do papel escolhido são exigidos, via .refine abaixo.
const schema = z
  .object({
    name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
    email: z.string().email('E-mail inválido'),
    password: passwordSchema,
    phone: z.string().optional(),
    role: z.enum(['DOADOR', 'RECEPTOR'], { message: 'Selecione um papel' }),

    donorName: z.string().optional(),
    donorDocument: z.string().optional(),
    donorType: z.enum(['MERCADO', 'RESTAURANTE', 'FEIRA', 'OUTRO']).optional(),
    donorAddress: z.string().optional(),
    donorCity: z.string().optional(),
    donorState: z.string().optional(),

    recipientName: z.string().optional(),
    recipientDocument: z.string().optional(),
    recipientType: z.enum(['ONG', 'FAMILIA']).optional(),
    recipientAddress: z.string().optional(),
    recipientCity: z.string().optional(),
    recipientState: z.string().optional(),
    // União com '' — sem isso, campo vazio coage pra 0/NaN e falha o
    // .positive(), bloqueando o cadastro em silêncio (o input não tem
    // mensagem de erro visível).
    recipientPeopleServed: z.union([z.literal(''), z.coerce.number().int().positive()]).optional(),
  })
  .refine((data) => data.role !== 'DOADOR' || (data.donorName?.length ?? 0) >= 2, {
    message: 'Nome do doador é obrigatório',
    path: ['donorName'],
  })
  .refine((data) => data.role !== 'DOADOR' || isValidDocument(data.donorDocument ?? ''), {
    message: 'Informe um CPF ou CNPJ válido',
    path: ['donorDocument'],
  })
  .refine((data) => data.role !== 'RECEPTOR' || isValidDocument(data.recipientDocument ?? ''), {
    message: 'Informe um CPF ou CNPJ válido',
    path: ['recipientDocument'],
  })
  .refine((data) => data.role !== 'RECEPTOR' || (data.recipientName?.length ?? 0) >= 2, {
    message: 'Nome do receptor é obrigatório',
    path: ['recipientName'],
  })

// Generics triplo por causa do z.coerce.number() em recipientPeopleServed —
// o tipo "de entrada" do campo (antes da coerção) difere do "de saída"
// (depois, o que chega no onSubmit).
type FormInput = z.input<typeof schema>
type FormValues = z.output<typeof schema>

export function Register() {
  const navigate = useNavigate()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FormInput, unknown, FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: 'DOADOR', donorType: 'OUTRO', recipientType: 'ONG' },
  })

  const role = watch('role')

  async function onSubmit(values: FormValues) {
    setFormError(null)
    try {
      const result = await registerRequest({
        name: values.name,
        email: values.email,
        password: values.password,
        phone: values.phone || undefined,
        role: values.role,
        donor:
          values.role === 'DOADOR'
            ? {
                name: values.donorName!,
                document: values.donorDocument,
                type: values.donorType ?? 'OUTRO',
                address: values.donorAddress || undefined,
                city: values.donorCity || undefined,
                state: values.donorState || undefined,
              }
            : undefined,
        recipient:
          values.role === 'RECEPTOR'
            ? {
                name: values.recipientName!,
                document: values.recipientDocument,
                type: values.recipientType ?? 'ONG',
                address: values.recipientAddress || undefined,
                city: values.recipientCity || undefined,
                state: values.recipientState || undefined,
                peopleServed:
                  values.recipientPeopleServed === '' || values.recipientPeopleServed === undefined
                    ? undefined
                    : Number(values.recipientPeopleServed),
              }
            : undefined,
      })
      saveSession(result)
      navigate('/', { replace: true })
    } catch (error) {
      const fieldErrors = getFieldErrors(error)
      if (fieldErrors) {
        Object.entries(fieldErrors).forEach(([field, messages]) => {
          setError(field as keyof FormValues, { message: messages[0] })
        })
      } else {
        setFormError(getErrorMessage(error))
      }
    }
  }

  return (
    <AuthShell
      headline="Faça parte dessa corrente do bem!"
      tagline="Doe, receba e ajude a transformar excedente em refeição."
      title="Criar conta"
      subtitle="Cadastre-se como doador ou receptor."
    >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Eu sou</label>
            <div className="grid grid-cols-2 gap-3">
              <label
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-3 py-3 text-center text-sm font-medium transition-colors ${
                  role === 'DOADOR' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 text-slate-600 hover:border-emerald-400'
                }`}
              >
                <input type="radio" value="DOADOR" className="sr-only" {...register('role')} />
                <Store size={22} aria-hidden="true" />
                Doador (mercado, restaurante, feira)
              </label>
              <label
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-xl border px-3 py-3 text-center text-sm font-medium transition-colors ${
                  role === 'RECEPTOR' ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-slate-300 text-slate-600 hover:border-emerald-400'
                }`}
              >
                <input type="radio" value="RECEPTOR" className="sr-only" {...register('role')} />
                <HeartHandshake size={22} aria-hidden="true" />
                Receptor (ONG, família)
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="name" className="mb-1 block text-sm font-medium text-slate-700">
                Nome
              </label>
              <input id="name" className="input" {...register('name')} />
              {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
            </div>
            <div>
              <label htmlFor="phone" className="mb-1 block text-sm font-medium text-slate-700">
                Telefone <span className="font-normal text-slate-400">(opcional)</span>
              </label>
              <input id="phone" className="input" {...register('phone')} />
            </div>
          </div>

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
              autoComplete="new-password"
              className="input"
              {...register('password')}
            />
            {errors.password && <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>}
          </div>

          {role === 'DOADOR' && (
            <div className="rounded-lg border border-slate-200 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Dados do doador</h2>
              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor="donorName" className="mb-1 block text-sm font-medium text-slate-700">
                    Nome do estabelecimento
                  </label>
                  <input id="donorName" className="input" {...register('donorName')} />
                  {errors.donorName && <p className="mt-1 text-xs text-red-600">{errors.donorName.message}</p>}
                </div>
                <div>
                  <label htmlFor="donorDocument" className="mb-1 block text-sm font-medium text-slate-700">
                    CPF ou CNPJ <span className="font-normal text-slate-400">(a administração confere antes de liberar o acesso)</span>
                  </label>
                  <input
                    id="donorDocument"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="00.000.000/0000-00"
                    className="input"
                    {...register('donorDocument', { onChange: (e) => (e.target.value = maskDocument(e.target.value)) })}
                  />
                  {errors.donorDocument && <p className="mt-1 text-xs text-red-600">{errors.donorDocument.message}</p>}
                </div>
                <div>
                  <label htmlFor="donorAddress" className="mb-1 block text-sm font-medium text-slate-700">
                    Endereço <span className="font-normal text-slate-400">(rua e número; usado para o mapa das rotas)</span>
                  </label>
                  <input id="donorAddress" autoComplete="street-address" className="input" {...register('donorAddress')} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="donorType" className="mb-1 block text-sm font-medium text-slate-700">
                      Tipo
                    </label>
                    <select id="donorType" className="input" {...register('donorType')}>
                      {Object.entries(DONOR_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="donorCity" className="mb-1 block text-sm font-medium text-slate-700">
                      Cidade
                    </label>
                    <input id="donorCity" className="input" {...register('donorCity')} />
                  </div>
                  <div>
                    <label htmlFor="donorState" className="mb-1 block text-sm font-medium text-slate-700">
                      UF
                    </label>
                    <input id="donorState" className="input" maxLength={2} {...register('donorState')} />
                  </div>
                </div>
              </div>
            </div>
          )}

          {role === 'RECEPTOR' && (
            <div className="rounded-lg border border-slate-200 p-4">
              <h2 className="mb-3 text-sm font-semibold text-slate-900">Dados do receptor</h2>
              <div className="flex flex-col gap-3">
                <div>
                  <label htmlFor="recipientName" className="mb-1 block text-sm font-medium text-slate-700">
                    Nome da ONG/família
                  </label>
                  <input id="recipientName" className="input" {...register('recipientName')} />
                  {errors.recipientName && (
                    <p className="mt-1 text-xs text-red-600">{errors.recipientName.message}</p>
                  )}
                </div>
                <div>
                  <label htmlFor="recipientDocument" className="mb-1 block text-sm font-medium text-slate-700">
                    CPF ou CNPJ <span className="font-normal text-slate-400">(a administração confere antes de liberar o acesso)</span>
                  </label>
                  <input
                    id="recipientDocument"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="00.000.000/0000-00"
                    className="input"
                    {...register('recipientDocument', { onChange: (e) => (e.target.value = maskDocument(e.target.value)) })}
                  />
                  {errors.recipientDocument && <p className="mt-1 text-xs text-red-600">{errors.recipientDocument.message}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="recipientType" className="mb-1 block text-sm font-medium text-slate-700">
                      Tipo
                    </label>
                    <select id="recipientType" className="input" {...register('recipientType')}>
                      {Object.entries(RECIPIENT_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="recipientPeopleServed" className="mb-1 block text-sm font-medium text-slate-700">
                      Pessoas atendidas <span className="font-normal text-slate-400">(opcional)</span>
                    </label>
                    <input
                      id="recipientPeopleServed"
                      type="number"
                      className="input"
                      {...register('recipientPeopleServed')}
                    />
                    {errors.recipientPeopleServed && (
                      <p className="mt-1 text-xs text-red-600">{errors.recipientPeopleServed.message}</p>
                    )}
                  </div>
                </div>
                <div>
                  <label htmlFor="recipientAddress" className="mb-1 block text-sm font-medium text-slate-700">
                    Endereço <span className="font-normal text-slate-400">(rua e número; usado para o mapa das rotas)</span>
                  </label>
                  <input id="recipientAddress" autoComplete="street-address" className="input" {...register('recipientAddress')} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="col-span-2">
                    <label htmlFor="recipientCity" className="mb-1 block text-sm font-medium text-slate-700">
                      Cidade
                    </label>
                    <input id="recipientCity" className="input" {...register('recipientCity')} />
                  </div>
                  <div>
                    <label htmlFor="recipientState" className="mb-1 block text-sm font-medium text-slate-700">
                      UF
                    </label>
                    <input id="recipientState" className="input" maxLength={2} {...register('recipientState')} />
                  </div>
                </div>
              </div>
            </div>
          )}

          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
            Para proteger doadores e quem recebe, todo cadastro novo passa por uma conferência rápida da administração antes de poder doar ou reservar.
          </p>

          {formError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-800 disabled:opacity-60"
          >
            <UserPlus size={16} />
            {isSubmitting ? 'Cadastrando...' : 'Cadastrar'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          Já tem conta?{' '}
          <Link to="/login" className="font-semibold text-emerald-700 hover:text-emerald-800">
            Entrar
          </Link>
        </p>
    </AuthShell>
  )
}
