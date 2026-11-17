export interface MonthlyKgRow {
  month: string
  totalKg: number
  donationCount: number
}

export interface ByDonorRow {
  donorId: string
  donorName: string
  totalKg: number
  donationCount: number
}

export interface ByRecipientRow {
  recipientId: string
  recipientName: string
  totalKg: number
  donationCount: number
}

export interface ReportSummary {
  totalKgRescued: number
  totalDonationsRescued: number
  deliveredDonations: number
  completedRoutes: number
  activeDonors: number
  activeRecipients: number
  donationsByStatus?: Partial<Record<string, number>>
}

// Indicadores do período (GET /reports/rates). Taxas são frações de 0 a 1, ou
// null quando não há base de cálculo.
export interface RatesReport {
  registered: number
  rescued: number
  delivered: number
  expired: number
  canceled: number
  rescueRate: number | null
  lossRate: number | null
  deliveryRate: number | null
  rescuedKg: number
  lostKg: number
  avgHoursToCollect: number | null
  peopleServed: number
}

export interface ReportPeriod {
  from?: string
  to?: string
}

// Série do gráfico (GET /reports/series): um ponto por dia, semana ou mês, já com os
// períodos sem coleta preenchidos com zero.
export interface SeriesPoint {
  start: string
  totalKg: number
  donationCount: number
}

export interface SeriesData {
  from: string
  to: string
  granularity: 'day' | 'week' | 'month'
  totalKg: number
  donationCount: number
  points: SeriesPoint[]
}
