import { afterEach, describe, expect, it, vi } from 'vitest'

// env.ts lê process.env no import; por isso cada caso recarrega os módulos.
async function load(env: Record<string, string>) {
  vi.resetModules()
  vi.unstubAllEnvs()
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value)
  return import('../src/storage/StorageDriver')
}

afterEach(() => vi.unstubAllEnvs())

describe('política de fotos conforme o armazenamento', () => {
  it('em desenvolvimento/teste, o disco local vale e as exigências seguem a configuração', async () => {
    const m = await load({ NODE_ENV: 'test', REQUIRE_OFFER_PHOTO: 'true' })
    expect(m.isStorageReady()).toBe(true)
    expect(m.photoPolicy()).toEqual({ enabled: true, offerRequired: true, pickupRequired: true })
  })

  it('em produção SEM Supabase, as fotos ficam desligadas e nada é exigido (a plataforma não trava)', async () => {
    const m = await load({ NODE_ENV: 'production', REQUIRE_OFFER_PHOTO: 'true', REQUIRE_PICKUP_PHOTO: 'true' })
    expect(m.isStorageReady()).toBe(false)
    expect(m.photoPolicy()).toEqual({ enabled: false, offerRequired: false, pickupRequired: false })
  })

  it('em produção sem Supabase, tentar gravar foto devolve 503 claro (em vez de perder a foto no próximo deploy)', async () => {
    const m = await load({ NODE_ENV: 'production' })
    try {
      m.getStorage()
      expect.unreachable('deveria ter lançado')
    } catch (error) {
      expect(error).toMatchObject({ statusCode: 503, message: expect.stringContaining('não está configurado') })
    }
  })

  it('em produção COM Supabase, liga as fotos e usa o Supabase', async () => {
    const m = await load({ NODE_ENV: 'production', SUPABASE_URL: 'https://abc.supabase.co', SUPABASE_SERVICE_KEY: 'sb_secret_abcdefghijklmnopqrstuvwxyz', REQUIRE_OFFER_PHOTO: 'true' })
    expect(m.photoPolicy()).toEqual({ enabled: true, offerRequired: true, pickupRequired: true })
    expect(m.getStorage().constructor.name).toBe('SupabaseStorageDriver')
  })

  it('STORAGE_ALLOW_LOCAL=true libera o disco em produção (servidor com volume próprio)', async () => {
    const m = await load({ NODE_ENV: 'production', STORAGE_ALLOW_LOCAL: 'true' })
    expect(m.isStorageReady()).toBe(true)
    expect(m.getStorage().constructor.name).toBe('LocalStorageDriver')
  })

  it('a exigência de foto da coleta pode ser desligada à parte', async () => {
    const m = await load({ NODE_ENV: 'test', REQUIRE_PICKUP_PHOTO: 'false' })
    expect(m.photoPolicy().pickupRequired).toBe(false)
  })
})
