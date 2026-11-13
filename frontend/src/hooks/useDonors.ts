import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createDonor, deactivateDonor, getDonor, listDonors, updateDonor } from '../services/donors'
import type { DonorInput } from '../types/donors'

export function useDonors(filters?: { includeInactive?: boolean; search?: string; approval?: string }, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['donors', filters],
    queryFn: () => listDonors(filters),
    enabled: options?.enabled ?? true,
  })
}

export function useDonor(id: string | undefined) {
  return useQuery({
    queryKey: ['donors', id],
    queryFn: () => getDonor(id!),
    enabled: !!id,
  })
}

export function useCreateDonor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DonorInput) => createDonor(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['donors'] }),
  })
}

export function useUpdateDonor(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DonorInput) => updateDonor(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['donors'] }),
  })
}

export function useDeactivateDonor() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => deactivateDonor(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['donors'] }),
  })
}
