import { useQuery } from '@tanstack/react-query'
import { getAppConfig, type AppConfig } from '../services/config'

// Enquanto a configuração não chega (ou se falhar), assume o caminho mais seguro
// para o usuário: fotos ligadas e obrigatórias na oferta, como é o padrão.
const FALLBACK: AppConfig = { photos: { enabled: true, offerRequired: true, pickupRequired: true } }

export function useAppConfig(): AppConfig {
  const { data } = useQuery({ queryKey: ['app-config'], queryFn: getAppConfig, staleTime: 5 * 60_000, retry: 1 })
  return data ?? FALLBACK
}
