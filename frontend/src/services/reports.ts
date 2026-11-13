import { api } from './api'
import type { MaintenanceResult, PendingReport } from '../types/pending'
import type { ByDonorRow, ByRecipientRow, MonthlyKgRow, RatesReport, ReportPeriod, ReportSummary } from '../types/reports'

export async function getMonthlyKg(params?: { year?: number; donorId?: string; recipientId?: string }): Promise<MonthlyKgRow[]> {
  const response = await api.get('/reports/monthly-kg', { params })
  return response.data.data
}

export async function getByDonor(params?: { year?: number }): Promise<ByDonorRow[]> {
  const response = await api.get('/reports/by-donor', { params })
  return response.data.data
}

export async function getByRecipient(params?: { year?: number }): Promise<ByRecipientRow[]> {
  const response = await api.get('/reports/by-recipient', { params })
  return response.data.data
}

export async function getSummary(): Promise<ReportSummary> {
  const response = await api.get('/reports/summary')
  return response.data.data
}

export async function getRates(params?: ReportPeriod): Promise<RatesReport> {
  const response = await api.get('/reports/rates', { params })
  return response.data.data
}

// Baixa o CSV pelo axios (que já manda os cookies e o CSRF) e dispara o download.
export async function downloadDonationsCsv(params?: ReportPeriod): Promise<void> {
  const response = await api.get('/reports/donations.csv', { params, responseType: 'blob' })
  const url = URL.createObjectURL(response.data as Blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `doacoes-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export async function getPending(): Promise<PendingReport> {
  const response = await api.get('/reports/pending')
  return response.data.data
}

export async function runMaintenance(): Promise<MaintenanceResult> {
  const response = await api.post('/maintenance/run-now')
  return response.data.data
}
