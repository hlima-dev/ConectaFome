import { api } from './api'
import type { Donor, DonorInput } from '../types/donors'

export async function listDonors(params?: { includeInactive?: boolean; search?: string; approval?: string }): Promise<Donor[]> {
  const response = await api.get('/donors', { params })
  return response.data.data.data
}

export async function getDonor(id: string): Promise<Donor> {
  const response = await api.get(`/donors/${id}`)
  return response.data.data
}

export async function createDonor(input: DonorInput): Promise<Donor> {
  const response = await api.post('/donors', input)
  return response.data.data
}

export async function updateDonor(id: string, input: DonorInput): Promise<Donor> {
  const response = await api.patch(`/donors/${id}`, input)
  return response.data.data
}

export async function deactivateDonor(id: string): Promise<void> {
  await api.delete(`/donors/${id}`)
}
