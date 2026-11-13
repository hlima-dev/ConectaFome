import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  attachDonationToRoute,
  cancelPickupRoute,
  collectRouteStop,
  completePickupRoute,
  createPickupRoute,
  detachDonationFromRoute,
  failRouteStop,
  getPickupRoute,
  listPickupRoutes,
  startPickupRoute,
  updatePickupRoute,
} from '../services/pickupRoutes'
import type { CollectedQuantity, PickupRouteInput, PickupRouteStatus } from '../types/logistics'

export function usePickupRoutes(filters?: { status?: PickupRouteStatus; vehicleId?: string; volunteerId?: string }) {
  return useQuery({
    queryKey: ['pickup-routes', filters],
    queryFn: () => listPickupRoutes(filters),
  })
}

export function usePickupRoute(id: string | undefined) {
  return useQuery({
    queryKey: ['pickup-routes', id],
    queryFn: () => getPickupRoute(id!),
    enabled: !!id,
  })
}

export function useCreatePickupRoute() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: PickupRouteInput) => createPickupRoute(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pickup-routes'] }),
  })
}

export function useUpdatePickupRoute(id: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: Partial<PickupRouteInput>) => updatePickupRoute(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pickup-routes'] }),
  })
}

function useRouteAction<TVariables = void>(mutationFn: (variables: TVariables) => Promise<unknown>) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pickup-routes'] })
      queryClient.invalidateQueries({ queryKey: ['donations'] })
    },
  })
}

export function useAttachDonation(routeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (donationId: string) => attachDonationToRoute(routeId, donationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pickup-routes'] })
      queryClient.invalidateQueries({ queryKey: ['donations'] })
    },
  })
}

export function useDetachDonation(routeId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (donationId: string) => detachDonationFromRoute(routeId, donationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pickup-routes'] })
      queryClient.invalidateQueries({ queryKey: ['donations'] })
    },
  })
}

export function useStartRoute(id: string) {
  return useRouteAction(() => startPickupRoute(id))
}

export function useCompleteRoute(id: string) {
  // Quantidades realmente coletadas (opcional): sem elas vale a estimada.
  return useRouteAction((collectedQuantities?: CollectedQuantity[]) => completePickupRoute(id, collectedQuantities))
}

export function useCancelRoute(id: string) {
  return useRouteAction(() => cancelPickupRoute(id))
}

export function useCollectStop(routeId: string) {
  return useRouteAction((input: { donationId: string; quantityKg?: number }) => collectRouteStop(routeId, input.donationId, input.quantityKg))
}

export function useFailStop(routeId: string) {
  return useRouteAction((input: { donationId: string; reason: string; note?: string }) => failRouteStop(routeId, input.donationId, input.reason, input.note))
}
