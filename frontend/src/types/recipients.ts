import type { RecipientType, ApprovalStatus } from './auth'

export interface Recipient {
  id: string
  userId: string | null
  name: string
  type: RecipientType
  document: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  zipCode: string | null
  peopleServed: number | null
  active: boolean
  user?: { email: string; approvalStatus: ApprovalStatus; approvalNote: string | null } | null
  createdAt: string
  updatedAt: string
}

export interface RecipientInput {
  name: string
  type?: RecipientType
  document?: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  peopleServed?: number
}
