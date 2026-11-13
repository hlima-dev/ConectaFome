import type { DonationAction } from './donations'

export interface AppNotification {
  id: string
  donationId: string | null
  action: DonationAction | null
  link: string | null
  message: string
  readAt: string | null
  createdAt: string
}

export interface NotificationList {
  items: AppNotification[]
  unreadCount: number
}
