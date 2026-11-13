import { Clock, ShieldAlert } from 'lucide-react'
import type { User } from '../types/auth'

// Avisa, em todas as telas, quando o cadastro ainda não pode operar.
export function ApprovalBanner({ user }: { user: User | null }) {
  if (!user || user.role === 'ADMIN' || !user.approvalStatus || user.approvalStatus === 'APROVADO') return null

  if (user.approvalStatus === 'REJEITADO') {
    return (
      <div role="alert" className="mb-4 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        <ShieldAlert className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
        <div>
          <p className="font-semibold">Seu cadastro não foi aprovado.</p>
          {user.approvalNote && <p className="mt-1">Motivo: {user.approvalNote}</p>}
          <p className="mt-1">Fale com a administração para corrigir os dados.</p>
        </div>
      </div>
    )
  }

  return (
    <div role="status" className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
      <Clock className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
      <div>
        <p className="font-semibold">Seu cadastro está em análise.</p>
        <p className="mt-1">
          A administração confere os dados antes de liberar {user.role === 'DOADOR' ? 'o registro de doações' : 'as reservas'}. Você será avisado aqui assim que for aprovado.
        </p>
      </div>
    </div>
  )
}
