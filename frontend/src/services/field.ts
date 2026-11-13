import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL ?? ''

// Cliente próprio, sem sessão: a página do voluntário é pública e quem autoriza é o
// token do link. Sem cookies, sem renovação de sessão, sem redirecionar para o login.
const fieldApi = axios.create({ baseURL: `${API_URL}/api/v1/field`, timeout: 90_000 })

export interface FieldDonation {
  id: string
  description: string
  estimatedKg: number
  collectedKg: number | null
  storageCondition: 'AMBIENTE' | 'REFRIGERADO' | 'CONGELADO'
  status: string
  notes: string | null
  recipientName: string | null
  recipientAddress: string | null
  photoCount: number
}

export interface FieldStop {
  sequence: number
  donorName: string
  address: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  contactName: string | null
  phone: string | null
  donations: FieldDonation[]
}

export interface FieldView {
  route: { routeNumber: number; status: 'PLANEJADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA'; scheduledFor: string; departedAt: string | null; completedAt: string | null }
  volunteerName: string
  vehicle: { plate: string; model: string }
  expiresAt: string
  requirePhoto: boolean
  stops: FieldStop[]
  failed: { id: string; description: string; donorName: string; reason: string | null; note: string | null }[]
}

export async function getFieldView(token: string): Promise<FieldView> {
  return (await fieldApi.get(`/${token}`)).data.data
}

export async function startFieldRoute(token: string): Promise<FieldView> {
  return (await fieldApi.post(`/${token}/start`)).data.data
}

export async function collectFieldStop(token: string, donationId: string, files: File[], quantityKg?: number): Promise<FieldView> {
  const data = new FormData()
  if (quantityKg !== undefined) data.append('quantityKg', String(quantityKg))
  files.forEach((file) => data.append('photos', file, file.name))
  return (await fieldApi.post(`/${token}/stops/${donationId}/collect`, data, { headers: { 'Content-Type': undefined } })).data.data
}

export async function failFieldStop(token: string, donationId: string, reason: string, note: string, files: File[]): Promise<FieldView> {
  const data = new FormData()
  data.append('reason', reason)
  if (note) data.append('note', note)
  files.forEach((file) => data.append('photos', file, file.name))
  return (await fieldApi.post(`/${token}/stops/${donationId}/fail`, data, { headers: { 'Content-Type': undefined } })).data.data
}

export async function finishFieldRoute(token: string): Promise<FieldView> {
  return (await fieldApi.post(`/${token}/finish`)).data.data
}
