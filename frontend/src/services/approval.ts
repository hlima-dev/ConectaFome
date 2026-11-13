import { api } from './api'
import type { ApprovalStatus } from '../types/auth'

export async function setApproval(kind: 'donors' | 'recipients', id: string, status: ApprovalStatus, note?: string) {
  const response = await api.patch(`/${kind}/${id}/approval`, { status, note: note || undefined })
  return response.data.data
}
