import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  cancelDonation,
  confirmReceiptDonation,
  createDonation,
  getDonation,
  getDonationEvents,
  getDonationReceipt,
  listDonations,
  listDonationsPage,
  type DonationListParams,
  listOpportunities,
  releaseDonation,
  reserveDonation,
  markExpiredDonation,
  matchDonation,
  updateDonation,
} from '../services/donations'
import type { DonationInput, DonationStatus, FoodCategory } from '../types/donations'

export function useDonations(
  filters?: { status?: DonationStatus; donorId?: string; recipientId?: string },
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ['donations', filters],
    queryFn: () => listDonations(filters),
    enabled: options?.enabled ?? true,
  })
}

export function useOpportunities(filters?: { city?: string; category?: FoodCategory }) {
  return useQuery({
    queryKey: ['opportunities', filters],
    queryFn: () => listOpportunities(filters),
    // Doação nova ou reservada por outro aparece sem precisar recarregar a página.
    refetchInterval: 45_000,
  })
}

export function useDonation(id: string | undefined) {
  return useQuery({
    queryKey: ['donations', id],
    queryFn: () => getDonation(id!),
    enabled: !!id,
  })
}

export function useDonationEvents(id: string | undefined) {
  return useQuery({
    queryKey: ['donations', id, 'events'],
    queryFn: () => getDonationEvents(id!),
    enabled: !!id,
  })
}

export function useDonationReceipt(id: string | undefined) {
  return useQuery({
    queryKey: ['donations', id, 'receipt'],
    queryFn: () => getDonationReceipt(id!),
    enabled: !!id,
    retry: false,
  })
}

export function useCreateDonation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DonationInput) => createDonation(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['donations'] }),
  })
}

export function useUpdateDonation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<DonationInput>) => updateDonation(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['donations'] }),
  })
}

export function useMatchDonation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (recipientId: string) => matchDonation(id, recipientId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['donations'] }),
  })
}

export function useCancelDonation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => cancelDonation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['donations'] }),
  })
}

export function useMarkExpiredDonation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => markExpiredDonation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['donations'] }),
  })
}

export function useConfirmReceiptDonation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => confirmReceiptDonation(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['donations'] }),
  })
}

// Reservar e liberar mexem em três coisas: o painel, a lista de doações e o sino.
function invalidateAfterReservation(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['opportunities'] })
  queryClient.invalidateQueries({ queryKey: ['donations'] })
  queryClient.invalidateQueries({ queryKey: ['notifications'] })
}

export function useReserveDonation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => reserveDonation(id),
    // Em caso de conflito (outra ONG reservou antes) o painel também precisa atualizar.
    onSettled: () => invalidateAfterReservation(queryClient),
  })
}

export function useReleaseDonation(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => releaseDonation(id),
    onSettled: () => invalidateAfterReservation(queryClient),
  })
}

export function useDonationsPage(params: DonationListParams) {
  return useQuery({
    queryKey: ['donations', 'page', params],
    queryFn: () => listDonationsPage(params),
    // Mantém a página anterior na tela enquanto carrega a próxima (sem piscar) e
    // atualiza sozinho: a situação das doações muda o tempo todo.
    placeholderData: (previous) => previous,
    refetchInterval: 60_000,
  })
}
