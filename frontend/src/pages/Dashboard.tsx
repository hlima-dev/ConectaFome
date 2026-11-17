import { Link } from 'react-router-dom'
import { useMemo, useState } from 'react'
import { Cell, Pie, PieChart } from 'recharts'
import { Boxes, HeartHandshake, Leaf, PackageCheck, Store, Truck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getStoredUser } from '../services/auth'
import { ROLE_LABELS } from '../types/auth'
import { useReportSummary, useSeries } from '../hooks/useReports'
import { KgChart } from '../components/reports/KgChart'
import { ModeSwitch, PeriodNavigator } from '../components/reports/PeriodControls'
import { rangeFor, shiftRef, type PeriodMode } from '../utils/period'
import { DONATION_STATUS_LABELS, type DonationStatus } from '../types/donations'
import { formatKg } from '../utils/format'
import { PendingPanel } from '../components/PendingPanel'
import { GettingStarted } from '../components/GettingStarted'

interface KpiCardProps {
  label: string
  value: string | number
  icon: LucideIcon
  // O que o número significa (aparece ao passar o mouse e para leitores de tela).
  help?: string
}

function KpiCard({ label, value, icon: Icon, help }: KpiCardProps) {
  return (
    <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-5" title={help}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
        <Icon size={22} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-2xl font-semibold text-slate-900">{value}</p>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
        {help && <p className="mt-0.5 text-xs text-slate-400">{help}</p>}
      </div>
    </div>
  )
}

// Cores por estado, na mesma lógica do StatusBadge (cinza = inicial, azul =
// em andamento, verde = concluído, vermelho = cancelado, âmbar = perdido).
const STATUS_COLORS: Record<DonationStatus, string> = {
  DISPONIVEL: '#94a3b8',
  RESERVADA: '#60a5fa',
  AGENDADA: '#3b82f6',
  COLETADA: '#0d9488',
  ENTREGUE: '#059669',
  CANCELADA: '#ef4444',
  VENCIDA: '#f59e0b',
}

const DASHBOARD_MODES: PeriodMode[] = ['semana', 'mes', 'ano']

export function Dashboard() {
  const user = getStoredUser()
  const isAdmin = user?.role === 'ADMIN'
  const { data: summary, isLoading } = useReportSummary({ enabled: isAdmin })
  // Gráfico de kg resgatado do painel: semana, mês ou ano, com setas. Abre no ano (a visão
  // que costuma ter dados); os Relatórios têm o filtro completo.
  const [mode, setMode] = useState<PeriodMode>('ano')
  const [ref, setRef] = useState(() => new Date())
  const range = useMemo(() => rangeFor(mode, ref), [mode, ref])
  const { data: series, isLoading: loadingSeries } = useSeries(isAdmin ? { from: range.from, to: range.to, granularity: range.granularity } : null)

  const statusData = (Object.keys(STATUS_COLORS) as DonationStatus[])
    .map((status) => ({ status, name: DONATION_STATUS_LABELS[status], value: summary?.donationsByStatus?.[status] ?? 0 }))
    .filter((row) => row.value > 0)
  const totalDonations = statusData.reduce((sum, row) => sum + row.value, 0)

  return (
    <div>
      <h1 className="text-2xl font-semibold text-slate-900">{isAdmin ? 'Dashboard administrativo' : 'Painel'}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {isAdmin ? 'Visão geral do impacto do ConectaFome. ' : ''}Bem-vindo(a), {user?.name} — {user ? ROLE_LABELS[user.role] : ''}
      </p>

      {!isAdmin && <GettingStarted role={user?.role} />}

      {!isAdmin && (
        <div className="mt-6 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-500">
          {user?.role === 'RECEPTOR' && (
            <>
              Veja o que está disponível agora em{' '}
              <Link to="/oportunidades" className="font-medium text-emerald-700 hover:underline">
                Oportunidades
              </Link>
              {' e '}
            </>
          )}
          {user?.role === 'RECEPTOR' ? 'acompanhe' : 'Acompanhe'} suas doações em{' '}
          <Link to="/doacoes" className="font-medium text-emerald-700 hover:underline">
            Doações
          </Link>
          .
        </div>
      )}

      {isAdmin && <PendingPanel />}

      {isAdmin && isLoading && <p className="mt-6 text-sm text-slate-400">Carregando indicadores...</p>}

      {isAdmin && summary && (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <KpiCard icon={Leaf} label="Kg resgatado (total)" value={formatKg(summary.totalKgRescued)} help="Peso coletado pelos voluntários" />
            <KpiCard icon={Boxes} label="Doações resgatadas" value={summary.totalDonationsRescued} help="Já coletadas do doador" />
            <KpiCard icon={PackageCheck} label="Doações entregues" value={summary.deliveredDonations} help="O receptor confirmou o recebimento" />
            <KpiCard icon={Truck} label="Rotas concluídas" value={summary.completedRoutes} />
            <KpiCard icon={Store} label="Doadores ativos" value={summary.activeDonors} />
            <KpiCard icon={HeartHandshake} label="Receptores ativos" value={summary.activeRecipients} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3">
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <ModeSwitch modes={DASHBOARD_MODES} value={mode} onChange={(next) => { setMode(next); setRef(new Date()) }} />
                <PeriodNavigator mode={mode} range={range} onMove={(direction) => setRef((r) => shiftRef(mode, r, direction))} />
              </div>
              <KgChart series={series} previous={undefined} mode={mode} loading={loadingSeries} compare={false} compact />
            </div>

            <section className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-2" aria-labelledby="dash-status">
              <h2 id="dash-status" className="mb-4 text-base font-semibold text-slate-900">
                Status das doações
              </h2>
              {statusData.length === 0 ? (
                <p className="text-sm text-slate-400">Nenhuma doação registrada ainda.</p>
              ) : (
                <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col xl:flex-row">
                  <div style={{ width: 150, height: 150 }}>
                    <PieChart width={150} height={150}>
                      <Pie data={statusData} isAnimationActive={false} dataKey="value" nameKey="name" innerRadius={42} outerRadius={70} paddingAngle={2}>
                        {statusData.map((row) => (
                          <Cell key={row.status} fill={STATUS_COLORS[row.status]} />
                        ))}
                      </Pie>
                    </PieChart>
                  </div>
                  <ul className="w-full space-y-1.5 text-sm">
                    {statusData.map((row) => (
                      <li key={row.status} className="flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2 text-slate-600">
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: STATUS_COLORS[row.status] }} aria-hidden="true" />
                          {row.name}
                        </span>
                        <span className="font-medium text-slate-900">
                          {row.value} <span className="font-normal text-slate-400">({Math.round((row.value / totalDonations) * 100)}%)</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          </div>

          <div className="mt-6">
            <Link to="/relatorios" className="text-sm font-medium text-emerald-700 hover:underline">
              Ver relatório completo →
            </Link>
          </div>
        </>
      )}
    </div>
  )
}
