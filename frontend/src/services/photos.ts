import { api } from './api'

export type PhotoKind = 'OFERTA' | 'COLETA' | 'ENTREGA'

export interface DonationPhoto {
  id: string
  kind: PhotoKind
  createdAt: string
  uploadedByLabel: string | null
  width: number | null
  height: number | null
}

export const PHOTO_KIND_LABELS: Record<PhotoKind, string> = {
  OFERTA: 'Foto da oferta (doador)',
  COLETA: 'Foto da coleta (voluntário)',
  ENTREGA: 'Foto da entrega (receptor)',
}

export async function listPhotos(donationId: string): Promise<DonationPhoto[]> {
  const response = await api.get(`/donations/${donationId}/photos`)
  return response.data.data
}

export async function uploadPhotos(donationId: string, files: File[], kind: 'OFERTA' | 'ENTREGA' = 'OFERTA'): Promise<DonationPhoto[]> {
  const data = new FormData()
  data.append('kind', kind)
  files.forEach((file) => data.append('photos', file, file.name))
  // Sem Content-Type fixo: o navegador define o multipart com o separador certo.
  const response = await api.post(`/donations/${donationId}/photos`, data, { headers: { 'Content-Type': undefined }, timeout: 60_000 })
  return response.data.data
}

// Endereço da imagem (a API confere quem pode ver; o cookie de sessão vai junto).
export function photoUrl(donationId: string, photoId: string): string {
  const base = import.meta.env.VITE_API_URL ?? ''
  return `${base}/api/v1/donations/${donationId}/photos/${photoId}/file`
}
