import type { BadgeTone } from '../components/StatusBadge'

export type FoodCategory = 'PERECIVEL' | 'NAO_PERECIVEL' | 'PREPARADO' | 'HORTIFRUTI' | 'PADARIA' | 'OUTRO'

export type StorageCondition = 'AMBIENTE' | 'REFRIGERADO' | 'CONGELADO'

export type DonationAction =
  | 'CRIADA'
  | 'CASADA'
  | 'RESERVADA'
  | 'LIBERADA'
  | 'AGENDADA'
  | 'DESAGENDADA'
  | 'COLETADA'
  | 'CONFIRMADA'
  | 'CANCELADA'
  | 'VENCIDA'
  | 'COLETA_FALHOU'

export type PickupFailureReason = 'DOADOR_AUSENTE' | 'RECUSADO' | 'PRODUTO_IMPROPRIO' | 'SEM_ESPACO_NO_VEICULO' | 'OUTRO'

export const PICKUP_FAILURE_LABELS: Record<PickupFailureReason, string> = {
  DOADOR_AUSENTE: 'Doador ausente',
  RECUSADO: 'Doador recusou entregar',
  PRODUTO_IMPROPRIO: 'Produto impróprio para consumo',
  SEM_ESPACO_NO_VEICULO: 'Sem espaço no veículo',
  OUTRO: 'Outro motivo',
}

export type DonationStatus =
  | 'DISPONIVEL'
  | 'RESERVADA'
  | 'AGENDADA'
  | 'COLETADA'
  | 'ENTREGUE'
  | 'CANCELADA'
  | 'VENCIDA'

export type UrgencyLevel = 'EXPIRED' | 'URGENT' | 'NORMAL'

// Calculada pelo backend: o que vencer primeiro entre a validade e o fim da
// janela de coleta. É nula depois que o alimento foi coletado.
export interface Urgency {
  level: UrgencyLevel
  deadline: string
  hoursLeft: number
}

export interface Donation {
  id: string
  donorId: string
  donor?: { id: string; name: string }
  category: FoodCategory
  description: string
  estimatedQuantityKg: string
  collectedQuantityKg: string | null
  bestBeforeDate: string | null
  pickupWindowStart: string
  pickupWindowEnd: string
  storageCondition: StorageCondition
  termsAcceptedAt: string | null
  status: DonationStatus
  recipientId: string | null
  recipient?: { id: string; name: string } | null
  matchedAt: string | null
  routeId: string | null
  route?: { id: string; routeNumber: number } | null
  collectedAt: string | null
  confirmedAt: string | null
  canceledAt: string | null
  expiredAt: string | null
  urgency: Urgency | null
  pickupFailureReason?: PickupFailureReason | null
  pickupFailureNote?: string | null
  pickupFailedAt?: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

// Doação como aparece no painel de oportunidades do receptor.
export interface Opportunity extends Omit<Donation, 'donor'> {
  donor: { id: string; name: string; city: string | null; state: string | null }
}

export interface DonationEvent {
  id: string
  action: DonationAction
  fromStatus: DonationStatus | null
  toStatus: DonationStatus
  createdAt: string
  actor: { id: string; name: string; role: 'ADMIN' | 'DOADOR' | 'RECEPTOR' } | null
  // Quem agiu quando não é usuário (ex.: voluntário pelo link de campo) e detalhe do evento.
  actorLabel?: string | null
  detail?: string | null
}

export interface DonationInput {
  donorId?: string
  category?: FoodCategory
  description: string
  estimatedQuantityKg: number
  bestBeforeDate?: string
  pickupWindowStart: string
  pickupWindowEnd: string
  storageCondition?: StorageCondition
  // Declaração do doador de que o alimento está próprio para consumo.
  acceptTerms: true
  notes?: string
}

export const FOOD_CATEGORY_LABELS: Record<FoodCategory, string> = {
  PERECIVEL: 'Perecível',
  NAO_PERECIVEL: 'Não perecível',
  PREPARADO: 'Preparado',
  HORTIFRUTI: 'Hortifruti',
  PADARIA: 'Padaria',
  OUTRO: 'Outro',
}

export const STORAGE_CONDITION_LABELS: Record<StorageCondition, string> = {
  AMBIENTE: 'Temperatura ambiente',
  REFRIGERADO: 'Refrigerado (até 4 °C)',
  CONGELADO: 'Congelado (−18 °C)',
}

// Categorias em que o doador precisa escolher a condição explicitamente.
export const STORAGE_REQUIRED_CATEGORIES: FoodCategory[] = ['PERECIVEL', 'PREPARADO']

export const DONATION_ACTION_LABELS: Record<DonationAction, string> = {
  CRIADA: 'Doação registrada',
  CASADA: 'Atribuída a um receptor pela administração',
  RESERVADA: 'Reservada pelo receptor',
  LIBERADA: 'Reserva desfeita',
  AGENDADA: 'Incluída em uma rota de coleta',
  DESAGENDADA: 'Removida da rota de coleta',
  COLETADA: 'Coletada',
  CONFIRMADA: 'Recebimento confirmado',
  CANCELADA: 'Cancelada',
  VENCIDA: 'Marcada como vencida',
  COLETA_FALHOU: 'Coleta não realizada',
}

export const DONATION_STATUS_LABELS: Record<DonationStatus, string> = {
  DISPONIVEL: 'Disponível',
  RESERVADA: 'Reservada',
  AGENDADA: 'Agendada',
  COLETADA: 'Coletada',
  ENTREGUE: 'Entregue',
  CANCELADA: 'Cancelada',
  VENCIDA: 'Vencida',
}

// Cinza = ainda ninguém se comprometeu, azul = em progresso rumo à coleta,
// verde = concluído com sucesso, vermelho = cancelado, âmbar = perdido
// (vencido) — mesma lógica de cores do StatusBadge em todo o app.
export const DONATION_STATUS_TONES: Record<DonationStatus, BadgeTone> = {
  DISPONIVEL: 'neutral',
  RESERVADA: 'blue',
  AGENDADA: 'blue',
  COLETADA: 'blue',
  ENTREGUE: 'green',
  CANCELADA: 'red',
  VENCIDA: 'amber',
}

export interface DonationReceipt {
  number: string
  issuedAt: string
  donor: { name: string; document: string | null; address: string | null }
  recipient: { name: string; document: string | null; address: string | null } | null
  donation: {
    description: string
    category: FoodCategory
    storageCondition: StorageCondition
    estimatedQuantityKg: number
    collectedQuantityKg: number | null
    status: DonationStatus
    bestBeforeDate: string | null
    termsAcceptedAt: string | null
    registeredAt: string
    collectedAt: string | null
    confirmedAt: string | null
  }
}
