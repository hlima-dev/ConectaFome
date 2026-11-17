import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Car, Check, MessageCircle, X } from 'lucide-react'
import { Modal } from './Modal'
import { StatusBadge } from './StatusBadge'
import { useApproveApplication, useRejectApplication, useVolunteerApplications } from '../hooks/useVolunteerApplications'
import { APPLICATION_STATUS_LABELS, AVAILABILITY_LABELS, type ApplicationStatus, type VolunteerApplication } from '../types/volunteerApplications'
import { isValidCpf, maskDocument } from '../utils/document'
import { getErrorMessage } from '../utils/errors'

const TONES = { PENDENTE: 'amber', APROVADA: 'green', RECUSADA: 'neutral' } as const

const FILTERS: { value: ApplicationStatus | ''; label: string }[] = [
  { value: 'PENDENTE', label: 'Aguardando análise' },
  { value: 'APROVADA', label: 'Aprovadas' },
  { value: 'RECUSADA', label: 'Recusadas' },
  { value: '', label: 'Todas' },
]

const when = (value: string) => new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

const formatPhone = (digits: string) =>
  digits.length === 11 ? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}` : digits.length === 10 ? `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}` : digits

// Abre a conversa no WhatsApp com a pessoa (o telefone vem sem o código do país).
const whatsappUrl = (digits: string, name: string) =>
  `https://wa.me/55${digits}?text=${encodeURIComponent(`Olá, ${name.split(' ')[0]}! Aqui é da equipe do ConectaFome. Recebemos a sua inscrição como voluntário(a) e gostaríamos de conversar.`)}`

// Lista de inscrições de voluntário: a administração analisa, conversa pelo WhatsApp,
// aprova (informando o CPF) ou recusa. Aprovada, a pessoa vira um voluntário cadastrado.
export function VolunteerApplications() {
  const [status, setStatus] = useState<ApplicationStatus | ''>('PENDENTE')
  const [approving, setApproving] = useState<VolunteerApplication | null>(null)
  const [rejecting, setRejecting] = useState<VolunteerApplication | null>(null)
  const [document, setDocument] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const { data, isLoading } = useVolunteerApplications(status || undefined)
  const approve = useApproveApplication()
  const reject = useRejectApplication()

  function closeModals() {
    setApproving(null)
    setRejecting(null)
    setDocument('')
    setNote('')
    setError(null)
  }

  async function confirmApprove() {
    if (!approving) return
    if (!isValidCpf(document)) {
      setError('Informe um CPF válido')
      return
    }
    setError(null)
    try {
      await approve.mutateAsync({ id: approving.id, document })
      setNotice(`${approving.name} foi aprovado(a) e já aparece em Voluntários. Para ele(a) coletar, inclua-o(a) em uma rota e gere o link na tela da rota.`)
      closeModals()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  async function confirmReject() {
    if (!rejecting) return
    setError(null)
    try {
      await reject.mutateAsync({ id: rejecting.id, note })
      setNotice(null)
      closeModals()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label htmlFor="application-status" className="text-sm text-slate-600">Mostrar</label>
        <select id="application-status" className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value as ApplicationStatus | '')}>
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>
      </div>

      {notice && (
        <p role="status" className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {notice} <Link to="/rotas" className="font-medium underline">Ir para as rotas</Link>
        </p>
      )}

      {isLoading && <p className="text-sm text-slate-500">Carregando inscrições...</p>}
      {!isLoading && data?.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {status === 'PENDENTE' ? 'Nenhuma inscrição aguardando análise. As novas aparecem aqui e no seu painel.' : 'Nenhuma inscrição neste filtro.'}
        </div>
      )}

      <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {data?.map((a) => (
          <li key={a.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-900">{a.name}</h3>
                <p className="text-sm text-slate-500">{a.city} · inscrito(a) em {when(a.createdAt)}</p>
              </div>
              <StatusBadge label={APPLICATION_STATUS_LABELS[a.status]} tone={TONES[a.status]} />
            </div>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-400">WhatsApp</dt>
              <dd className="text-slate-800">{formatPhone(a.phone)}</dd>
              {a.email && (<><dt className="text-slate-400">E-mail</dt><dd className="break-all text-slate-800">{a.email}</dd></>)}
              <dt className="text-slate-400">Pode ajudar</dt>
              <dd className="text-slate-800">{a.availability.map((v) => AVAILABILITY_LABELS[v]).join(' · ')}</dd>
              {a.hasVehicle && (<><dt className="text-slate-400">Veículo</dt><dd className="inline-flex items-center gap-1.5 text-slate-800"><Car size={14} aria-hidden="true" /> Tem veículo</dd></>)}
            </dl>

            {a.message && <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm italic text-slate-600">“{a.message}”</p>}
            {a.status === 'RECUSADA' && a.reviewNote && <p className="text-xs text-slate-500">Motivo: {a.reviewNote}</p>}
            {a.status === 'APROVADA' && a.volunteer && <p className="text-xs text-emerald-800">Cadastrado como voluntário: {a.volunteer.name}</p>}

            <div className="mt-auto flex flex-wrap gap-2">
              <a href={whatsappUrl(a.phone, a.name)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                <MessageCircle size={15} aria-hidden="true" /> WhatsApp
              </a>
              {a.status === 'PENDENTE' && (
                <>
                  <button type="button" onClick={() => setApproving(a)} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
                    <Check size={15} aria-hidden="true" /> Aprovar
                  </button>
                  <button type="button" onClick={() => setRejecting(a)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
                    <X size={15} aria-hidden="true" /> Recusar
                  </button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      {approving && (
        <Modal title={`Aprovar ${approving.name}`} onClose={closeModals}>
          <p className="mb-3 text-sm text-slate-600">
            Ao aprovar, a pessoa passa a constar em <strong>Voluntários</strong> e pode ser escolhida em uma rota. O cadastro de voluntário exige o CPF, que o formulário público não pede: informe-o depois de conversar com a pessoa.
          </p>
          <label htmlFor="approve-cpf" className="mb-1 block text-sm font-medium text-slate-700">CPF do voluntário</label>
          <input id="approve-cpf" className="input" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" value={document} onChange={(e) => setDocument(maskDocument(e.target.value))} />
          {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={closeModals}>Cancelar</button>
            <button type="button" disabled={approve.isPending} onClick={confirmApprove} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">
              {approve.isPending ? 'Aprovando...' : 'Aprovar e cadastrar'}
            </button>
          </div>
        </Modal>
      )}

      {rejecting && (
        <Modal title={`Recusar ${rejecting.name}`} onClose={closeModals}>
          <label htmlFor="reject-note" className="mb-1 block text-sm font-medium text-slate-700">Motivo <span className="font-normal text-slate-400">(fica só para a administração; a pessoa recebe uma mensagem neutra)</span></label>
          <textarea id="reject-note" className="input min-h-20" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          {error && <p role="alert" className="mt-2 text-sm text-red-600">{error}</p>}
          <div className="mt-4 flex justify-end gap-3">
            <button type="button" className="rounded-lg border border-slate-300 px-4 py-2 text-sm" onClick={closeModals}>Cancelar</button>
            <button type="button" disabled={reject.isPending} onClick={confirmReject} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60">
              Recusar inscrição
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
