import { api } from './api'
import type { Recipient, RecipientInput } from '../types/recipients'

export async function listRecipients(params?: { includeInactive?: boolean; search?: string; approval?: string }): Promise<Recipient[]> {
  const response = await api.get('/recipients', { params })
  return response.data.data.data
}

export async function getRecipient(id: string): Promise<Recipient> {
  const response = await api.get(`/recipients/${id}`)
  return response.data.data
}

export async function createRecipient(input: RecipientInput): Promise<Recipient> {
  const response = await api.post('/recipients', input)
  return response.data.data
}

export async function updateRecipient(id: string, input: RecipientInput): Promise<Recipient> {
  const response = await api.patch(`/recipients/${id}`, input)
  return response.data.data
}

export async function deactivateRecipient(id: string): Promise<void> {
  await api.delete(`/recipients/${id}`)
}
