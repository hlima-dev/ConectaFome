import type { BadgeTone } from '../components/StatusBadge'
import type { Donation } from './donations'

export interface Volunteer {
  id: string
  name: string
  document: string
  phone: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface VolunteerInput {
  name: string
  document: string
  phone?: string
}

export interface Vehicle {
  id: string
  plate: string
  model: string
  capacityKg: string | null
  active: boolean
  createdAt: string
  updatedAt: string
}

export interface VehicleInput {
  plate: string
  model: string
  capacityKg?: number
}

export type PickupRouteStatus = 'PLANEJADA' | 'EM_ANDAMENTO' | 'CONCLUIDA' | 'CANCELADA'

export interface RouteStopDonation {
  id: string
  description: string
  estimatedKg: number
  deadline: string | null
}

export interface RouteStop {
  donorId: string
  donorName: string
  address: string | null
  city: string | null
  latitude: number | null
  longitude: number | null
  donations: RouteStopDonation[]
}

// Parada com coordenadas, já na ordem sugerida.
export interface PlannedStop extends RouteStop {
  latitude: number
  longitude: number
  sequence: number
  legKm: number
}

export interface RoutePlan {
  stops: PlannedStop[]
  totalKm: number
  unlocated: RouteStop[]
  recipients: { id: string; name: string; address: string | null; latitude: number; longitude: number }[]
}

export interface VehicleLoad {
  totalKg: number
  capacityKg: number | null
  exceeds: boolean
  remainingKg: number | null
}

export interface PickupRoute {
  id: string
  routeNumber: number
  vehicleId: string
  vehicle: Vehicle
  volunteerId: string
  volunteer: Volunteer
  status: PickupRouteStatus
  scheduledFor: string
  departedAt: string | null
  completedAt: string | null
  canceledAt: string | null
  notes: string | null
  donations: Donation[]
  // Paradas que não deram certo nesta rota (só no detalhe).
  failedDonations?: Donation[]
  // Só no detalhe da rota (GET /pickup-routes/:id e respostas das ações).
  load?: VehicleLoad
  plan?: RoutePlan
  createdAt: string
  updatedAt: string
}

export interface CollectedQuantity {
  donationId: string
  collectedQuantityKg: number
}

export interface PickupRouteInput {
  vehicleId: string
  volunteerId: string
  scheduledFor: string
  notes?: string
}

export const PICKUP_ROUTE_STATUS_LABELS: Record<PickupRouteStatus, string> = {
  PLANEJADA: 'Planejada',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  CANCELADA: 'Cancelada',
}

export const PICKUP_ROUTE_STATUS_TONES: Record<PickupRouteStatus, BadgeTone> = {
  PLANEJADA: 'neutral',
  EM_ANDAMENTO: 'blue',
  CONCLUIDA: 'green',
  CANCELADA: 'red',
}
