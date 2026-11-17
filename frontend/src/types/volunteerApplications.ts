export type ApplicationStatus = 'PENDENTE' | 'APROVADA' | 'RECUSADA'
export type Availability = 'SEMANA_MANHA' | 'SEMANA_TARDE' | 'SEMANA_NOITE' | 'FIM_DE_SEMANA'

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  SEMANA_MANHA: 'Manhã, em dias úteis',
  SEMANA_TARDE: 'Tarde, em dias úteis',
  SEMANA_NOITE: 'Noite, em dias úteis',
  FIM_DE_SEMANA: 'Fins de semana',
}

export const APPLICATION_STATUS_LABELS: Record<ApplicationStatus, string> = {
  PENDENTE: 'Aguardando análise',
  APROVADA: 'Aprovada',
  RECUSADA: 'Recusada',
}

export interface VolunteerApplicationInput {
  name: string
  phone: string
  email?: string
  city: string
  availability: Availability[]
  hasVehicle: boolean
  message?: string
  consent: true
  // Campo-isca contra robôs: sempre vazio para pessoas.
  website?: string
}

export interface VolunteerApplication {
  id: string
  name: string
  phone: string
  email: string | null
  city: string
  availability: Availability[]
  hasVehicle: boolean
  message: string | null
  status: ApplicationStatus
  reviewNote: string | null
  reviewedAt: string | null
  createdAt: string
  volunteer: { id: string; name: string; active: boolean } | null
}
