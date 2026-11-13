export type Role = 'ADMIN' | 'DOADOR' | 'RECEPTOR'
export type ApprovalStatus = 'PENDENTE' | 'APROVADO' | 'REJEITADO'

export const APPROVAL_LABELS: Record<ApprovalStatus, string> = {
  PENDENTE: 'Em análise',
  APROVADO: 'Aprovado',
  REJEITADO: 'Rejeitado',
}
export type DonorType = 'MERCADO' | 'RESTAURANTE' | 'FEIRA' | 'OUTRO'
export type RecipientType = 'ONG' | 'FAMILIA'

export interface User {
  id: string
  name: string
  email: string
  role: Role
  phone: string | null
  active: boolean
  approvalStatus?: ApprovalStatus
  approvalNote?: string | null
  createdAt: string
  donorProfile?: { id: string } | null
  recipientProfile?: { id: string } | null
}

export interface DonorProfileInput {
  name: string
  type: DonorType
  document?: string
  contactName?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
}

export interface RecipientProfileInput {
  name: string
  type: RecipientType
  document?: string
  contactName?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  peopleServed?: number
}

export interface RegisterInput {
  name: string
  email: string
  password: string
  phone?: string
  role: 'DOADOR' | 'RECEPTOR'
  donor?: DonorProfileInput
  recipient?: RecipientProfileInput
}

export interface LoginInput {
  email: string
  password: string
}

export interface AuthResponse {
  user: User
  csrfToken: string
}

export const DONOR_TYPE_LABELS: Record<DonorType, string> = {
  MERCADO: 'Mercado',
  RESTAURANTE: 'Restaurante',
  FEIRA: 'Feira',
  OUTRO: 'Outro',
}

export const RECIPIENT_TYPE_LABELS: Record<RecipientType, string> = {
  ONG: 'ONG',
  FAMILIA: 'Família em vulnerabilidade',
}

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Administrador',
  DOADOR: 'Doador',
  RECEPTOR: 'Receptor',
}
