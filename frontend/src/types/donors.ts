import type { DonorType, ApprovalStatus } from './auth'

export interface Donor {
  id: string
  userId: string | null
  name: string
  type: DonorType
  document: string | null
  contactName: string | null
  phone: string | null
  email: string | null
  address: string | null
  city: string | null
  state: string | null
  zipCode: string | null
  active: boolean
  user?: { email: string; approvalStatus: ApprovalStatus; approvalNote: string | null } | null
  createdAt: string
  updatedAt: string
}

export interface DonorInput {
  name: string
  type?: DonorType
  document?: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
}
