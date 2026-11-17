import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { approveApplication, listApplications, rejectApplication } from '../services/volunteerApplications'
import type { ApplicationStatus } from '../types/volunteerApplications'

export function useVolunteerApplications(status?: ApplicationStatus) {
  return useQuery({
    queryKey: ['volunteer-applications', status],
    queryFn: () => listApplications(status ? { status } : undefined),
    refetchInterval: 60_000,
  })
}

function useReview<TVariables>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['volunteer-applications'] })
      queryClient.invalidateQueries({ queryKey: ['volunteers'] })
      queryClient.invalidateQueries({ queryKey: ['pending'] })
    },
  })
}

export function useApproveApplication() {
  return useReview((input: { id: string; document: string }) => approveApplication(input.id, input.document))
}

export function useRejectApplication() {
  return useReview((input: { id: string; note?: string }) => rejectApplication(input.id, input.note))
}
