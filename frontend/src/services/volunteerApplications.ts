import { api } from './api'
import type { ApplicationStatus, VolunteerApplication, VolunteerApplicationInput } from '../types/volunteerApplications'

// Formulário público da página inicial (sem login).
export async function applyAsVolunteer(input: VolunteerApplicationInput): Promise<string> {
  const response = await api.post('/public/volunteers/apply', input)
  return response.data.message
}

export async function listApplications(params?: { status?: ApplicationStatus }): Promise<VolunteerApplication[]> {
  const response = await api.get('/volunteer-applications', { params: { ...params, limit: 100 } })
  return response.data.data.data
}

export async function approveApplication(id: string, document: string) {
  const response = await api.patch(`/volunteer-applications/${id}/approve`, { document })
  return response.data.data
}

export async function rejectApplication(id: string, note?: string): Promise<void> {
  await api.patch(`/volunteer-applications/${id}/reject`, { note: note || undefined })
}
