import { api } from './api'
import type { Donation, DonationEvent, DonationReceipt, DonationInput, DonationStatus, FoodCategory, Opportunity } from '../types/donations'

export async function listDonations(params?: {
  status?: DonationStatus
  donorId?: string
  recipientId?: string
}): Promise<Donation[]> {
  const response = await api.get('/donations', { params })
  return response.data.data.data
}

export async function getDonation(id: string): Promise<Donation> {
  const response = await api.get(`/donations/${id}`)
  return response.data.data
}

export async function getDonationEvents(id: string): Promise<DonationEvent[]> {
  const response = await api.get(`/donations/${id}/events`)
  return response.data.data
}

export async function createDonation(input: DonationInput): Promise<Donation> {
  const response = await api.post('/donations', input)
  return response.data.data
}

export async function updateDonation(id: string, input: Partial<DonationInput>): Promise<Donation> {
  const response = await api.patch(`/donations/${id}`, input)
  return response.data.data
}

export async function matchDonation(id: string, recipientId: string): Promise<Donation> {
  const response = await api.patch(`/donations/${id}/match`, { recipientId })
  return response.data.data
}

export async function cancelDonation(id: string): Promise<Donation> {
  const response = await api.patch(`/donations/${id}/cancel`)
  return response.data.data
}

export async function markExpiredDonation(id: string): Promise<Donation> {
  const response = await api.patch(`/donations/${id}/mark-expired`)
  return response.data.data
}

export async function confirmReceiptDonation(id: string): Promise<Donation> {
  const response = await api.patch(`/donations/${id}/confirm-receipt`)
  return response.data.data
}

export async function listOpportunities(params?: { city?: string; category?: FoodCategory }): Promise<Opportunity[]> {
  const response = await api.get('/donations/opportunities', { params: { limit: 100, ...params } })
  return response.data.data.data
}

export async function reserveDonation(id: string): Promise<Donation> {
  const response = await api.patch(`/donations/${id}/reserve`)
  return response.data.data
}

export async function releaseDonation(id: string): Promise<Donation> {
  const response = await api.patch(`/donations/${id}/release`)
  return response.data.data
}

export async function getDonationReceipt(id: string): Promise<DonationReceipt> {
  const response = await api.get(`/donations/${id}/receipt`)
  return response.data.data
}

export interface DonationListParams {
  status?: DonationStatus
  q?: string
  from?: string
  to?: string
  sort?: 'recentes' | 'prazo'
  page?: number
  limit?: number
}

export interface PageMeta {
  total: number
  page: number
  limit: number
  totalPages: number
  hasNext: boolean
  hasPrev: boolean
}

// Lista paginada, com busca, período e ordem (usada pela tela de Doações).
export async function listDonationsPage(params: DonationListParams): Promise<{ data: Donation[]; meta: PageMeta }> {
  const clean = Object.fromEntries(Object.entries(params).filter(([, v]) => v !== '' && v !== undefined))
  const response = await api.get('/donations', { params: clean })
  return response.data.data
}
