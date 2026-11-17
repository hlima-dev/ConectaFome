import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { getByDonor, getByRecipient, getMonthlyKg, getPending, getRates, getSeries, getSummary, runMaintenance } from '../services/reports'
import type { ReportPeriod } from '../types/reports'

export function useMonthlyKg(filters?: { year?: number; donorId?: string; recipientId?: string }) {
  return useQuery({
    queryKey: ['reports', 'monthly-kg', filters],
    queryFn: () => getMonthlyKg(filters),
  })
}

export function useSeries(params: { from: string; to: string; granularity: string; donorId?: string; recipientId?: string } | null) {
  return useQuery({
    queryKey: ['reports', 'series', params],
    queryFn: () => getSeries(params!),
    enabled: params !== null,
    // Mantém o gráfico anterior na tela enquanto o novo carrega: troca suave, sem piscar.
    placeholderData: (previous) => previous,
  })
}

export function useByDonor(filters?: { year?: number; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['reports', 'by-donor', filters],
    queryFn: () => getByDonor(filters),
  })
}

export function useByRecipient(filters?: { year?: number; from?: string; to?: string }) {
  return useQuery({
    queryKey: ['reports', 'by-recipient', filters],
    queryFn: () => getByRecipient(filters),
  })
}

export function useReportSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['reports', 'summary'],
    queryFn: () => getSummary(),
    enabled: options?.enabled ?? true,
  })
}

export function useRates(period?: ReportPeriod) {
  return useQuery({
    queryKey: ['reports', 'rates', period],
    queryFn: () => getRates(period),
  })
}

// A fila do que precisa de ação: reconsulta a cada minuto e quando a janela volta ao foco.
export function usePending(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['pending'],
    queryFn: getPending,
    enabled: options?.enabled ?? true,
    refetchInterval: 60_000,
  })
}

export function useRunMaintenance() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: runMaintenance,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending'] })
      queryClient.invalidateQueries({ queryKey: ['donations'] })
      queryClient.invalidateQueries({ queryKey: ['opportunities'] })
    },
  })
}
