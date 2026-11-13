import { useMutation, useQueryClient } from '@tanstack/react-query'
import { setApproval } from '../services/approval'
import type { ApprovalStatus } from '../types/auth'

export function useSetApproval(kind: 'donors' | 'recipients') {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { id: string; status: ApprovalStatus; note?: string }) => setApproval(kind, input.id, input.status, input.note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [kind] })
      queryClient.invalidateQueries({ queryKey: ['pending'] })
    },
  })
}
