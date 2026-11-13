import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { listPhotos, uploadPhotos } from '../services/photos'

export function usePhotos(donationId: string | undefined) {
  return useQuery({ queryKey: ['photos', donationId], queryFn: () => listPhotos(donationId!), enabled: !!donationId })
}

export function useUploadPhotos(donationId: string) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { files: File[]; kind: 'OFERTA' | 'ENTREGA' }) => uploadPhotos(donationId, input.files, input.kind),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['photos', donationId] })
      queryClient.invalidateQueries({ queryKey: ['donations'] })
      queryClient.invalidateQueries({ queryKey: ['opportunities'] })
    },
  })
}
