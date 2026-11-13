import { api } from './api'

export interface AppConfig {
  photos: { enabled: boolean; offerRequired: boolean; pickupRequired: boolean }
}

export async function getAppConfig(): Promise<AppConfig> {
  const response = await api.get('/config')
  return response.data.data
}
