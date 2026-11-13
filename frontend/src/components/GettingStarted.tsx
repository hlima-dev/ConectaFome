import { Link } from 'react-router-dom'
import { CheckCircle2, Circle } from 'lucide-react'
import { useCurrentUser } from '../hooks/useCurrentUser'
import { useDonations } from '../hooks/useDonations'
import type { Role } from '../types/auth'

interface Step {
  done: boolean
  text: React.ReactNode
}

// Primeiros passos para doador e receptor: diz o que fazer agora, na ordem, e some
// quando tudo estiver feito (para quem já usa o sistema não vira ruído).
export function GettingStarted({ role }: { role: Role | undefined }) {
  const user = useCurrentUser()
  const { data: donations, isLoading } = useDonations(undefined, { enabled: role === 'DOADOR' || role === 'RECEPTOR' })
  if ((role !== 'DOADOR' && role !== 'RECEPTOR') || isLoading) return null

  const approved = user?.approvalStatus === undefined || user.approvalStatus === 'APROVADO'
  const hasDonations = (donations?.length ?? 0) > 0

  const steps: Step[] =
    role === 'DOADOR'
      ? [
          { done: approved, text: 'Aguarde a aprovação do seu cadastro pela administração (você é avisado aqui).' },
          { done: hasDonations, text: <>Registre a sua primeira doação em <Link to="/doacoes" className="font-medium text-emerald-700 hover:underline">Doações</Link>, com foto do alimento.</> },
          { done: donations?.some((d) => ['COLETADA', 'ENTREGUE'].includes(d.status)) ?? false, text: 'Acompanhe até a coleta e baixe o comprovante da doação.' },
        ]
      : [
          { done: approved, text: 'Aguarde a aprovação do seu cadastro pela administração (você é avisado aqui).' },
          { done: hasDonations, text: <>Veja o que está disponível em <Link to="/oportunidades" className="font-medium text-emerald-700 hover:underline">Oportunidades</Link> e reserve o que a sua instituição consegue aproveitar.</> },
          { done: donations?.some((d) => d.status === 'ENTREGUE') ?? false, text: 'Quando o voluntário entregar, confirme o recebimento na tela da doação.' },
        ]

  if (steps.every((s) => s.done)) return null

  return (
    <section className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5" aria-labelledby="primeiros-passos">
      <h2 id="primeiros-passos" className="mb-3 text-base font-semibold text-emerald-950">Primeiros passos</h2>
      <ol className="space-y-2 text-sm text-emerald-950">
        {steps.map((step, index) => (
          <li key={index} className="flex items-start gap-2">
            {step.done ? <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-700" aria-label="Feito" /> : <Circle size={18} className="mt-0.5 shrink-0 text-emerald-400" aria-label="A fazer" />}
            <span className={step.done ? 'text-emerald-800/70 line-through' : ''}>{step.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
