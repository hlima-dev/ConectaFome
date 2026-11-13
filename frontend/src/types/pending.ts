export interface PendingGroup<T> {
  count: number
  items: T[]
}

export interface PendingDonation {
  id: string
  code: string
  description: string
  donorName: string
  recipientName?: string | null
  hoursLeft?: number
  waitingHours?: number | null
}

export interface PendingReport {
  generatedAt: string
  total: number
  approvals: PendingGroup<{ kind: 'donor' | 'recipient'; id: string; name: string; waitingHours: number | null }>
  urgentAvailable: PendingGroup<PendingDonation>
  reservedWithoutRoute: PendingGroup<PendingDonation>
  awaitingConfirmation: PendingGroup<PendingDonation>
  overdueScheduled: PendingGroup<PendingDonation>
  withoutPhoto: PendingGroup<PendingDonation>
  routesToday: PendingGroup<{ id: string; routeNumber: number; status: string; scheduledFor: string; volunteerName: string }>
}

export interface MaintenanceResult {
  ranAt: string
  expired: number
  released: number
}
