import { ApprovalStatus, DonationStatus, PhotoKind, PickupRouteStatus, Prisma } from '@prisma/client'
import { prisma } from '../config/prisma'
import { photoPolicy } from '../storage/StorageDriver'
import { computeUrgency } from '../utils/urgency'
import { donationCode } from '../utils/donationCode'
import { toCsv } from '../utils/csv'
import { ValidationError } from '../utils/AppError'

interface MonthlyKgFilter {
  year?: number
  donorId?: string
  recipientId?: string
}

interface ByGroupFilter {
  year?: number
  // Período por data de coleta (AAAA-MM-DD, inclusivo, horário de Brasília). Tem
  // prioridade sobre `year` quando informado.
  from?: string
  to?: string
}

export type Granularity = 'day' | 'week' | 'month'

export interface SeriesFilter {
  from: string
  to: string
  granularity: Granularity
  donorId?: string
  recipientId?: string
}

// As datas dos relatórios são dias no horário de Brasília (UTC-3; o Brasil não tem
// horário de verão desde 2019). O banco guarda UTC, então o "dia" de uma coleta às
// 22h de Brasília cai no dia seguinte em UTC: por isso o recorte é feito por aqui.
const MAX_BUCKETS = 400

export function brtDayRange(from: string, to: string) {
  const gte = new Date(`${from}T00:00:00-03:00`)
  const lt = new Date(new Date(`${to}T00:00:00-03:00`).getTime() + DAY_MS)
  return { gte, lt }
}

const ymd = (d: Date) => d.toISOString().slice(0, 10)
const parseDay = (value: string) => new Date(`${value}T00:00:00.000Z`)
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY_MS)

// Início (segunda-feira, como o date_trunc('week') do PostgreSQL) da semana da data.
function mondayOf(d: Date) {
  const weekday = (d.getUTCDay() + 6) % 7 // seg = 0
  return addDays(d, -weekday)
}

// Todos os "baldes" do período, para o gráfico não ter buracos nos dias sem coleta.
export function bucketStarts(from: string, to: string, granularity: Granularity): string[] {
  const end = parseDay(to)
  const out: string[] = []
  if (granularity === 'day') {
    for (let d = parseDay(from); d <= end; d = addDays(d, 1)) out.push(ymd(d))
  } else if (granularity === 'week') {
    for (let d = mondayOf(parseDay(from)); d <= end; d = addDays(d, 7)) out.push(ymd(d))
  } else {
    const start = parseDay(from)
    for (let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1)); d <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      out.push(ymd(d))
    }
  }
  return out
}

// Período em datas inclusivas (AAAA-MM-DD, tratadas em UTC). Vazio = sem limite.
export interface PeriodFilter {
  from?: string
  to?: string
}

const DAY_MS = 24 * 60 * 60 * 1000

// Doações "do período" = as registradas nele (createdAt). O fim é inclusivo:
// `to` = 2026-11-30 inclui tudo até 30/11 às 23:59.
function createdAtRange(period: PeriodFilter) {
  if (!period.from && !period.to) return {}
  return {
    createdAt: {
      ...(period.from ? { gte: new Date(`${period.from}T00:00:00.000Z`) } : {}),
      ...(period.to ? { lt: new Date(new Date(`${period.to}T00:00:00.000Z`).getTime() + DAY_MS) } : {}),
    },
  }
}

const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 1000 : null)

// COLETADA e ENTREGUE contam juntas como "resgatado" em todo relatório — o
// resgate de verdade já aconteceu na coleta; ENTREGUE é só um estado
// posterior da mesma doação (ver nota no schema sobre o ciclo de status).
const RESCUED_STATUSES: DonationStatus[] = [DonationStatus.COLETADA, DonationStatus.ENTREGUE]

export class ReportService {
  // Agregação mensal precisa truncar data, o que o query builder do Prisma
  // não faz sozinho — por isso SQL cru aqui (com Prisma.sql, nunca
  // concatenação de string), enquanto os relatórios por doador/receptor
  // abaixo usam groupBy normalmente. Escolha deliberada: cada ferramenta
  // onde ela realmente é necessária, não SQL cru em tudo.
  async monthlyKg(filter: MonthlyKgFilter = {}) {
    const conditions = [Prisma.sql`status IN ('COLETADA', 'ENTREGUE')`, Prisma.sql`"collectedAt" IS NOT NULL`]

    if (filter.year) {
      conditions.push(Prisma.sql`EXTRACT(YEAR FROM "collectedAt") = ${filter.year}`)
    }
    if (filter.donorId) {
      conditions.push(Prisma.sql`"donorId" = ${filter.donorId}`)
    }
    if (filter.recipientId) {
      conditions.push(Prisma.sql`"recipientId" = ${filter.recipientId}`)
    }

    const where = Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`

    const rows = await prisma.$queryRaw<{ month: Date; total_kg: number; donation_count: number }[]>(Prisma.sql`
      SELECT date_trunc('month', "collectedAt") AS month,
             SUM("collectedQuantityKg")::float AS total_kg,
             COUNT(*)::int AS donation_count
      FROM donations
      ${where}
      GROUP BY month
      ORDER BY month ASC
    `)

    return rows.map((row) => ({
      month: row.month,
      totalKg: Number(row.total_kg ?? 0),
      donationCount: Number(row.donation_count ?? 0),
    }))
  }

  // Série para o gráfico: kg e nº de doações coletadas por dia, semana ou mês, com os
  // períodos sem coleta preenchidos com zero.
  async series(filter: SeriesFilter) {
    if (filter.from > filter.to) throw new ValidationError('A data inicial não pode ser depois da final')
    const starts = bucketStarts(filter.from, filter.to, filter.granularity)
    if (starts.length > MAX_BUCKETS) {
      throw new ValidationError(`Período grande demais para esta escala (${starts.length} pontos). Use semanas ou meses.`)
    }

    const { gte, lt } = brtDayRange(filter.from, filter.to)
    const conditions = [
      Prisma.sql`status IN ('COLETADA', 'ENTREGUE')`,
      Prisma.sql`"collectedAt" >= ${gte}`,
      Prisma.sql`"collectedAt" < ${lt}`,
    ]
    if (filter.donorId) conditions.push(Prisma.sql`"donorId" = ${filter.donorId}`)
    if (filter.recipientId) conditions.push(Prisma.sql`"recipientId" = ${filter.recipientId}`)

    const rows = await prisma.$queryRaw<{ bucket: string; total_kg: number; donation_count: number }[]>(Prisma.sql`
      SELECT to_char(date_trunc(${filter.granularity}::text, "collectedAt" - interval '3 hours'), 'YYYY-MM-DD') AS bucket,
             SUM("collectedQuantityKg")::float AS total_kg,
             COUNT(*)::int AS donation_count
      FROM donations
      WHERE ${Prisma.join(conditions, ' AND ')}
      GROUP BY bucket
    `)
    const byBucket = new Map(rows.map((r) => [r.bucket, r]))

    const points = starts.map((start) => {
      const row = byBucket.get(start)
      return { start, totalKg: Number(row?.total_kg ?? 0), donationCount: Number(row?.donation_count ?? 0) }
    })
    return {
      from: filter.from,
      to: filter.to,
      granularity: filter.granularity,
      totalKg: Math.round(points.reduce((sum, p) => sum + p.totalKg, 0) * 100) / 100,
      donationCount: points.reduce((sum, p) => sum + p.donationCount, 0),
      points,
    }
  }

  async byDonor(filter: ByGroupFilter = {}) {
    const grouped = await prisma.donation.groupBy({
      by: ['donorId'],
      where: { status: { in: RESCUED_STATUSES }, ...this.collectedRange(filter) },
      _sum: { collectedQuantityKg: true },
      _count: true,
    })

    const donors = await prisma.donor.findMany({
      where: { id: { in: grouped.map((g) => g.donorId) } },
      select: { id: true, name: true },
    })
    const donorNames = new Map(donors.map((d) => [d.id, d.name]))

    return grouped
      .map((g) => ({
        donorId: g.donorId,
        donorName: donorNames.get(g.donorId) ?? 'Desconhecido',
        totalKg: Number(g._sum.collectedQuantityKg ?? 0),
        donationCount: g._count,
      }))
      .sort((a, b) => b.totalKg - a.totalKg)
  }

  async byRecipient(filter: ByGroupFilter = {}) {
    const grouped = await prisma.donation.groupBy({
      by: ['recipientId'],
      where: { status: { in: RESCUED_STATUSES }, recipientId: { not: null }, ...this.collectedRange(filter) },
      _sum: { collectedQuantityKg: true },
      _count: true,
    })

    const ids = grouped.map((g) => g.recipientId).filter((id): id is string => !!id)
    const recipients = await prisma.recipient.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    const recipientNames = new Map(recipients.map((r) => [r.id, r.name]))

    return grouped
      .filter((g): g is typeof g & { recipientId: string } => !!g.recipientId)
      .map((g) => ({
        recipientId: g.recipientId,
        recipientName: recipientNames.get(g.recipientId) ?? 'Desconhecido',
        totalKg: Number(g._sum.collectedQuantityKg ?? 0),
        donationCount: g._count,
      }))
      .sort((a, b) => b.totalKg - a.totalKg)
  }

  // Alimenta os cards de KPI do Dashboard.
  async summary() {
    const [aggregate, activeDonors, activeRecipients, completedRoutes, deliveredDonations, byStatus] = await Promise.all([
      prisma.donation.aggregate({
        where: { status: { in: RESCUED_STATUSES } },
        _sum: { collectedQuantityKg: true },
        _count: true,
      }),
      prisma.donor.count({ where: { active: true } }),
      prisma.recipient.count({ where: { active: true } }),
      prisma.pickupRoute.count({ where: { status: PickupRouteStatus.CONCLUIDA } }),
      prisma.donation.count({ where: { status: DonationStatus.ENTREGUE } }),
      prisma.donation.groupBy({ by: ['status'], _count: true }),
    ])

    return {
      totalKgRescued: Number(aggregate._sum.collectedQuantityKg ?? 0),
      totalDonationsRescued: aggregate._count,
      deliveredDonations,
      completedRoutes,
      activeDonors,
      activeRecipients,
      // Quantas doações há em cada estado (todas as já registradas), para o gráfico do painel.
      donationsByStatus: Object.fromEntries(byStatus.map((g) => [g.status, g._count])) as Record<string, number>,
    }
  }

  // Indicadores do período. As taxas são frações (0 a 1) ou null quando não há
  // base de cálculo. "Resgatada" = coletada ou entregue (igual ao resto dos
  // relatórios); "perda" = vencida antes da coleta.
  async rates(period: PeriodFilter = {}) {
    const where = createdAtRange(period)

    const [byStatus, kg, avg, delivered] = await Promise.all([
      prisma.donation.groupBy({ by: ['status'], where, _count: true }),
      prisma.donation.groupBy({
        by: ['status'],
        where: { ...where, status: { in: [...RESCUED_STATUSES, DonationStatus.VENCIDA] } },
        _sum: { collectedQuantityKg: true, estimatedQuantityKg: true },
      }),
      this.avgHoursToCollect(period),
      prisma.donation.findMany({
        where: { ...where, status: DonationStatus.ENTREGUE, recipientId: { not: null } },
        distinct: ['recipientId'],
        select: { recipient: { select: { peopleServed: true } } },
      }),
    ])

    const count = (status: DonationStatus) => byStatus.find((g) => g.status === status)?._count ?? 0
    const registered = byStatus.reduce((sum, g) => sum + g._count, 0)
    const rescued = RESCUED_STATUSES.reduce((sum, st) => sum + count(st), 0)
    const expired = count(DonationStatus.VENCIDA)
    const deliveredCount = count(DonationStatus.ENTREGUE)

    const rescuedKg = kg
      .filter((g) => RESCUED_STATUSES.includes(g.status))
      .reduce((sum, g) => sum + Number(g._sum.collectedQuantityKg ?? 0), 0)
    const lostKg = Number(kg.find((g) => g.status === DonationStatus.VENCIDA)?._sum.estimatedQuantityKg ?? 0)

    return {
      registered,
      rescued,
      delivered: deliveredCount,
      expired,
      canceled: count(DonationStatus.CANCELADA),
      rescueRate: ratio(rescued, registered),
      lossRate: ratio(expired, registered),
      // Entregues sobre as que chegaram a ser coletadas.
      deliveryRate: ratio(deliveredCount, rescued),
      rescuedKg: Math.round(rescuedKg * 100) / 100,
      lostKg: Math.round(lostKg * 100) / 100,
      avgHoursToCollect: avg,
      // Soma de pessoas atendidas pelas instituições que receberam ao menos uma
      // entrega no período (cada instituição conta uma vez). Famílias sem o
      // campo preenchido contam zero.
      peopleServed: delivered.reduce((sum, d) => sum + (d.recipient?.peopleServed ?? 0), 0),
    }
  }

  // Média de horas entre o registro da doação e a coleta, nas resgatadas do período.
  private async avgHoursToCollect(period: PeriodFilter): Promise<number | null> {
    // `collectedAt >= createdAt` descarta dados inconsistentes (coleta "antes" do
    // registro, p.ex. importações), que dariam média negativa.
    const conditions = [
      Prisma.sql`status IN ('COLETADA', 'ENTREGUE')`,
      Prisma.sql`"collectedAt" IS NOT NULL`,
      Prisma.sql`"collectedAt" >= "createdAt"`,
    ]
    if (period.from) conditions.push(Prisma.sql`"createdAt" >= ${new Date(`${period.from}T00:00:00.000Z`)}`)
    if (period.to) {
      conditions.push(Prisma.sql`"createdAt" < ${new Date(new Date(`${period.to}T00:00:00.000Z`).getTime() + DAY_MS)}`)
    }

    const rows = await prisma.$queryRaw<{ avg_hours: number | null }[]>(Prisma.sql`
      SELECT AVG(EXTRACT(EPOCH FROM ("collectedAt" - "createdAt")) / 3600)::float AS avg_hours
      FROM donations
      WHERE ${Prisma.join(conditions, ' AND ')}
    `)
    const value = rows[0]?.avg_hours
    return value === null || value === undefined ? null : Math.round(Number(value) * 10) / 10
  }

  // Todas as doações registradas no período, uma por linha, para planilha
  // (prestação de contas, ESG). O texto livre é neutralizado contra injeção de fórmula.
  async donationsCsv(period: PeriodFilter = {}): Promise<string> {
    const donations = await prisma.donation.findMany({
      where: createdAtRange(period),
      include: { donor: { select: { name: true } }, recipient: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    })

    return toCsv(
      [
        'Código', 'Doador', 'Receptor', 'Categoria', 'Descrição', 'Armazenamento', 'Kg estimado', 'Kg coletado',
        'Status', 'Registrada em', 'Coletada em', 'Entregue em', 'Vencida em', 'Cancelada em',
      ],
      donations.map((d) => [
        d.id,
        d.donor.name,
        d.recipient?.name,
        d.category,
        d.description,
        d.storageCondition,
        Number(d.estimatedQuantityKg),
        d.collectedQuantityKg === null ? null : Number(d.collectedQuantityKg),
        d.status,
        d.createdAt,
        d.collectedAt,
        d.confirmedAt,
        d.expiredAt,
        d.canceledAt,
      ]),
    )
  }

  // Período por data de coleta: from/to (dias de Brasília) ou, se faltarem, o ano.
  private collectedRange(filter: ByGroupFilter) {
    if (filter.from || filter.to) {
      const { gte, lt } = brtDayRange(filter.from ?? '1970-01-01', filter.to ?? '2999-12-31')
      return { collectedAt: { ...(filter.from ? { gte } : {}), ...(filter.to ? { lt } : {}) } }
    }
    return this.yearRange(filter.year)
  }

  private yearRange(year?: number) {
    if (!year) return {}
    return {
      collectedAt: {
        gte: new Date(Date.UTC(year, 0, 1)),
        lt: new Date(Date.UTC(year + 1, 0, 1)),
      },
    }
  }

  // "O que precisa de ação agora" para a administração. Cada grupo traz o total e
  // os 5 mais antigos/urgentes; o painel leva para a lista completa.
  async pending(now: Date = new Date()) {
    const TOP = 5
    const HOUR = 3_600_000

    const [pendingUsers, open, withoutPhoto, routes, applications] = await Promise.all([
      prisma.user.findMany({
        where: { approvalStatus: ApprovalStatus.PENDENTE },
        orderBy: { createdAt: 'asc' },
        select: { id: true, createdAt: true, donorProfile: { select: { id: true, name: true } }, recipientProfile: { select: { id: true, name: true } } },
        take: 100,
      }),
      prisma.donation.findMany({
        where: { status: { in: [DonationStatus.DISPONIVEL, DonationStatus.RESERVADA, DonationStatus.AGENDADA, DonationStatus.COLETADA] } },
        select: {
          id: true, number: true, description: true, status: true, routeId: true, matchedAt: true, collectedAt: true,
          bestBeforeDate: true, pickupWindowEnd: true,
          donor: { select: { name: true } }, recipient: { select: { name: true } },
        },
        take: 500,
      }),
      photoPolicy().offerRequired
        ? prisma.donation.findMany({
            where: { status: DonationStatus.DISPONIVEL, photos: { none: { kind: PhotoKind.OFERTA } } },
            select: { id: true, number: true, description: true, donor: { select: { name: true } } },
            orderBy: { createdAt: 'asc' },
            take: 50,
          })
        : Promise.resolve([]),
      prisma.pickupRoute.findMany({
        where: { status: { in: [PickupRouteStatus.PLANEJADA, PickupRouteStatus.EM_ANDAMENTO] }, scheduledFor: { lte: new Date(now.getTime() + 24 * HOUR) } },
        orderBy: { scheduledFor: 'asc' },
        select: { id: true, routeNumber: true, status: true, scheduledFor: true, volunteer: { select: { name: true } } },
        take: 50,
      }),
      prisma.volunteerApplication.findMany({
        where: { status: 'PENDENTE' },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, city: true, createdAt: true },
        take: 100,
      }),
    ])

    const brief = (d: (typeof open)[number], extra: Record<string, unknown> = {}) => ({
      id: d.id,
      code: donationCode(d.number),
      description: d.description,
      donorName: d.donor.name,
      recipientName: d.recipient?.name ?? null,
      ...extra,
    })
    const hoursSince = (date: Date | null) => (date ? Math.round(((now.getTime() - date.getTime()) / HOUR) * 10) / 10 : null)

    const urgentAvailable = open
      .filter((d) => d.status === DonationStatus.DISPONIVEL)
      .map((d) => ({ d, u: computeUrgency(d, now) }))
      .filter(({ u }) => u?.level === 'URGENT')
      .sort((a, b) => a.u!.hoursLeft - b.u!.hoursLeft)

    const reservedWithoutRoute = open
      .filter((d) => d.status === DonationStatus.RESERVADA && !d.routeId)
      .sort((a, b) => (a.matchedAt?.getTime() ?? 0) - (b.matchedAt?.getTime() ?? 0))

    const awaitingConfirmation = open
      .filter((d) => d.status === DonationStatus.COLETADA && d.collectedAt && now.getTime() - d.collectedAt.getTime() > 24 * HOUR)
      .sort((a, b) => a.collectedAt!.getTime() - b.collectedAt!.getTime())

    const overdueScheduled = open
      .filter((d) => d.status === DonationStatus.AGENDADA)
      .map((d) => ({ d, u: computeUrgency(d, now) }))
      .filter(({ u }) => u?.level === 'EXPIRED')

    const approvals = pendingUsers.map((u) => ({
      kind: u.donorProfile ? ('donor' as const) : ('recipient' as const),
      id: (u.donorProfile ?? u.recipientProfile)?.id ?? u.id,
      name: (u.donorProfile ?? u.recipientProfile)?.name ?? 'Cadastro sem perfil',
      waitingHours: hoursSince(u.createdAt),
    }))

    return {
      generatedAt: now,
      total:
        approvals.length + applications.length + urgentAvailable.length + reservedWithoutRoute.length + awaitingConfirmation.length + overdueScheduled.length + withoutPhoto.length,
      approvals: { count: approvals.length, items: approvals.slice(0, TOP) },
      volunteerApplications: {
        count: applications.length,
        items: applications.slice(0, TOP).map((a) => ({ id: a.id, name: a.name, city: a.city, waitingHours: hoursSince(a.createdAt) })),
      },
      urgentAvailable: { count: urgentAvailable.length, items: urgentAvailable.slice(0, TOP).map(({ d, u }) => brief(d, { hoursLeft: u!.hoursLeft })) },
      reservedWithoutRoute: { count: reservedWithoutRoute.length, items: reservedWithoutRoute.slice(0, TOP).map((d) => brief(d, { waitingHours: hoursSince(d.matchedAt) })) },
      awaitingConfirmation: { count: awaitingConfirmation.length, items: awaitingConfirmation.slice(0, TOP).map((d) => brief(d, { waitingHours: hoursSince(d.collectedAt) })) },
      overdueScheduled: { count: overdueScheduled.length, items: overdueScheduled.slice(0, TOP).map(({ d }) => brief(d)) },
      withoutPhoto: { count: withoutPhoto.length, items: withoutPhoto.slice(0, TOP).map((d) => ({ id: d.id, code: donationCode(d.number), description: d.description, donorName: d.donor.name })) },
      routesToday: {
        count: routes.length,
        items: routes.slice(0, TOP).map((r) => ({ id: r.id, routeNumber: r.routeNumber, status: r.status, scheduledFor: r.scheduledFor, volunteerName: r.volunteer.name })),
      },
    }
  }
}
