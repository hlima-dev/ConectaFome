import { useState } from 'react'
import { HandHeart, MessageCircle, Smartphone, Truck, CheckCircle2 } from 'lucide-react'
import { applyAsVolunteer } from '../services/volunteerApplications'
import { AVAILABILITY_LABELS, type Availability } from '../types/volunteerApplications'
import { getErrorMessage } from '../utils/errors'

const AVAILABILITY = Object.keys(AVAILABILITY_LABELS) as Availability[]

// (15) 99999-1111, enquanto digita.
function maskPhone(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
}

interface Errors {
  name?: string
  phone?: string
  email?: string
  city?: string
  availability?: string
  consent?: string
}

const field = 'input'
const label = 'mb-1 block text-sm font-medium text-slate-700'

// "Seja voluntário": formulário público da página inicial. A pessoa se inscreve; a
// administração analisa, aprova e, depois, manda o link da rota. Não cria conta.
export function VolunteerSignup() {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [availability, setAvailability] = useState<Availability[]>([])
  const [hasVehicle, setHasVehicle] = useState(false)
  const [message, setMessage] = useState('')
  const [consent, setConsent] = useState(false)
  const [website, setWebsite] = useState('') // isca para robôs
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState(false)

  function validate(): Errors {
    const e: Errors = {}
    if (name.trim().length < 2) e.name = 'Informe o seu nome'
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10 && digits.length !== 11) e.phone = 'Informe o WhatsApp com DDD'
    if (email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) e.email = 'E-mail inválido'
    if (city.trim().length < 2) e.city = 'Informe a sua cidade'
    if (availability.length === 0) e.availability = 'Escolha ao menos um horário'
    if (!consent) e.consent = 'É preciso concordar para a equipe poder falar com você'
    return e
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    setFormError(null)
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSending(true)
    try {
      await applyAsVolunteer({
        name: name.trim(),
        phone,
        email: email.trim() || undefined,
        city: city.trim(),
        availability,
        hasVehicle,
        message: message.trim() || undefined,
        consent: true,
        website,
      })
      setDone(true)
    } catch (error) {
      setFormError(getErrorMessage(error))
    } finally {
      setSending(false)
    }
  }

  function toggle(value: Availability) {
    setAvailability((current) => (current.includes(value) ? current.filter((a) => a !== value) : [...current, value]))
    setErrors((e) => ({ ...e, availability: undefined }))
  }

  return (
    <section id="voluntarios" className="scroll-mt-20 bg-emerald-50 py-14" aria-labelledby="voluntarios-titulo">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-2">
        <div>
          <p className="mb-2 inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-800">
            <HandHeart size={14} aria-hidden="true" /> Voluntariado
          </p>
          <h2 id="voluntarios-titulo" className="text-3xl font-bold text-emerald-950">Quer ajudar a levar comida a quem precisa?</h2>
          <p className="mt-3 text-slate-600">
            Os voluntários fazem a ponte entre quem doa e quem recebe: buscam o alimento no doador e entregam à instituição. Você escolhe quando pode ajudar.
          </p>
          <ul className="mt-6 space-y-4 text-sm text-slate-700">
            <li className="flex gap-3">
              <MessageCircle className="mt-0.5 shrink-0 text-emerald-700" size={20} aria-hidden="true" />
              <span><strong>1. Você se inscreve</strong> aqui, em um minuto. A equipe analisa e fala com você pelo WhatsApp.</span>
            </li>
            <li className="flex gap-3">
              <Smartphone className="mt-0.5 shrink-0 text-emerald-700" size={20} aria-hidden="true" />
              <span><strong>2. Aprovado, você recebe o link da rota</strong> no celular, sem criar conta nem senha: endereços, telefone do doador e o que coletar.</span>
            </li>
            <li className="flex gap-3">
              <Truck className="mt-0.5 shrink-0 text-emerald-700" size={20} aria-hidden="true" />
              <span><strong>3. Você coleta e registra</strong> cada parada com uma foto. Quem tem veículo ajuda ainda mais, mas não é obrigatório.</span>
            </li>
          </ul>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-emerald-100">
          {done ? (
            <div role="status" className="py-6 text-center">
              <CheckCircle2 className="mx-auto text-emerald-600" size={44} aria-hidden="true" />
              <h3 className="mt-3 text-xl font-semibold text-slate-900">Inscrição recebida!</h3>
              <p className="mt-2 text-sm text-slate-600">
                Obrigado por querer ajudar. A equipe do ConectaFome vai analisar e entrar em contato pelo WhatsApp que você informou.
              </p>
            </div>
          ) : (
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4" aria-label="Inscrição de voluntário">
              <div>
                <label htmlFor="vol-name" className={label}>Nome completo</label>
                <input id="vol-name" className={field} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name}</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="vol-phone" className={label}>WhatsApp (com DDD)</label>
                  <input id="vol-phone" className={field} inputMode="tel" autoComplete="tel-national" placeholder="(15) 99999-0000" value={phone} onChange={(e) => setPhone(maskPhone(e.target.value))} />
                  {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
                </div>
                <div>
                  <label htmlFor="vol-city" className={label}>Cidade</label>
                  <input id="vol-city" className={field} autoComplete="address-level2" value={city} onChange={(e) => setCity(e.target.value)} />
                  {errors.city && <p className="mt-1 text-xs text-red-600">{errors.city}</p>}
                </div>
              </div>

              <div>
                <label htmlFor="vol-email" className={label}>E-mail <span className="font-normal text-slate-400">(opcional)</span></label>
                <input id="vol-email" type="email" className={field} autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                {errors.email && <p className="mt-1 text-xs text-red-600">{errors.email}</p>}
              </div>

              <fieldset>
                <legend className={label}>Quando você pode ajudar?</legend>
                <div className="flex flex-wrap gap-2">
                  {AVAILABILITY.map((value) => {
                    const active = availability.includes(value)
                    return (
                      <label key={value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors ${active ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 text-slate-600 hover:border-emerald-400'}`}>
                        <input type="checkbox" className="sr-only" checked={active} onChange={() => toggle(value)} />
                        {AVAILABILITY_LABELS[value]}
                      </label>
                    )
                  })}
                </div>
                {errors.availability && <p className="mt-1 text-xs text-red-600">{errors.availability}</p>}
              </fieldset>

              <label className="flex items-start gap-2 text-sm text-slate-700">
                <input type="checkbox" className="mt-0.5" checked={hasVehicle} onChange={(e) => setHasVehicle(e.target.checked)} />
                <span>Tenho veículo (carro, van ou moto com baú) e posso fazer coletas.</span>
              </label>

              <div>
                <label htmlFor="vol-message" className={label}>Quer contar algo? <span className="font-normal text-slate-400">(opcional)</span></label>
                <textarea id="vol-message" className={field} rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
                <p className="mt-1 text-right text-xs text-slate-400">{message.length}/500</p>
              </div>

              {/* Isca para robôs: invisível e fora do alcance do teclado. */}
              <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                <label htmlFor="vol-website">Não preencha este campo</label>
                <input id="vol-website" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
              </div>

              <div>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                  <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => { setConsent(e.target.checked); setErrors((x) => ({ ...x, consent: undefined })) }} />
                  <span>Concordo em ser contatado(a) pela equipe do ConectaFome, por WhatsApp, telefone ou e-mail, sobre o voluntariado. Meus dados serão usados só para isso.</span>
                </label>
                {errors.consent && <p className="mt-1 text-xs text-red-600">{errors.consent}</p>}
              </div>

              {formError && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>}

              <button type="submit" disabled={sending} className="rounded-lg bg-emerald-800 px-6 py-3 font-semibold text-white transition-colors hover:bg-emerald-900 disabled:opacity-60">
                {sending ? 'Enviando...' : 'Quero ser voluntário'}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
