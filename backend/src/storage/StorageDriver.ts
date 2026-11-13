import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { env } from '../config/env'
import { AppError } from '../utils/AppError'

export interface StoredObject {
  data: Buffer
  contentType: string
}

export interface StorageDriver {
  put(key: string, data: Buffer, contentType: string): Promise<void>
  get(key: string): Promise<StoredObject>
  remove(key: string): Promise<void>
}

// Só chaves geradas pelo sistema: letras, números, "-", "_" e "/", terminando em
// extensão de imagem. Barra qualquer tentativa de sair da pasta (../).
const SAFE_KEY = /^[A-Za-z0-9_-]+(\/[A-Za-z0-9_-]+)*\.(webp|jpg|png)$/

function assertSafeKey(key: string): void {
  if (!SAFE_KEY.test(key)) throw new Error('Chave de armazenamento inválida')
}

export class LocalStorageDriver implements StorageDriver {
  constructor(private baseDir: string = env.STORAGE_DIR) {}

  private resolve(key: string): string {
    assertSafeKey(key)
    return path.join(path.resolve(this.baseDir), key)
  }

  async put(key: string, data: Buffer): Promise<void> {
    const file = this.resolve(key)
    await mkdir(path.dirname(file), { recursive: true })
    await writeFile(file, data)
  }

  async get(key: string): Promise<StoredObject> {
    const data = await readFile(this.resolve(key))
    return { data, contentType: key.endsWith('.png') ? 'image/png' : key.endsWith('.jpg') ? 'image/jpeg' : 'image/webp' }
  }

  async remove(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true })
  }
}

// Supabase Storage pela API REST, com a chave de serviço (que fica só no
// servidor). O bucket deve ser PRIVADO: as imagens só saem pela nossa API, depois
// de conferir quem pode ver.
export class SupabaseStorageDriver implements StorageDriver {
  constructor(
    private url: string = env.SUPABASE_URL ?? '',
    private serviceKey: string = env.SUPABASE_SERVICE_KEY ?? '',
    private bucket: string = env.SUPABASE_BUCKET,
  ) {}

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    // Chaves novas (sb_secret_...) vão só em `apikey`; a chave antiga (JWT
    // "service_role") também vai em Authorization.
    return {
      apikey: this.serviceKey,
      ...(this.serviceKey.startsWith('eyJ') ? { Authorization: `Bearer ${this.serviceKey}` } : {}),
      ...extra,
    }
  }

  private endpoint(kind: 'object' | 'object/authenticated', key: string): string {
    assertSafeKey(key)
    return `${this.url.replace(/\/$/, '')}/storage/v1/${kind}/${this.bucket}/${key}`
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const response = await fetch(this.endpoint('object', key), {
      method: 'POST',
      headers: this.headers({ 'Content-Type': contentType, 'x-upsert': 'false' }),
      body: new Uint8Array(data),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`Falha ao gravar a foto no armazenamento (HTTP ${response.status})`)
  }

  async get(key: string): Promise<StoredObject> {
    const response = await fetch(this.endpoint('object/authenticated', key), {
      headers: this.headers(),
      signal: AbortSignal.timeout(20_000),
    })
    if (!response.ok) throw new Error(`Falha ao ler a foto no armazenamento (HTTP ${response.status})`)
    return { data: Buffer.from(await response.arrayBuffer()), contentType: response.headers.get('content-type') ?? 'image/webp' }
  }

  async remove(key: string): Promise<void> {
    const response = await fetch(this.endpoint('object', key), {
      method: 'DELETE',
      headers: this.headers(),
      signal: AbortSignal.timeout(20_000),
    })
    // 404 = já não existe; não é erro.
    if (!response.ok && response.status !== 404) throw new Error(`Falha ao apagar a foto no armazenamento (HTTP ${response.status})`)
  }
}

// Em produção, guardar foto no disco do servidor perderia tudo a cada deploy (o
// disco do Render gratuito é apagado). Sem Supabase configurado, o recurso de fotos
// fica DESLIGADO em vez de aceitar uploads que depois somem. STORAGE_ALLOW_LOCAL=true
// força o disco (ex.: servidor próprio com volume persistente).
export function isStorageReady(): boolean {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) return true
  if (env.NODE_ENV !== 'production') return true
  return process.env.STORAGE_ALLOW_LOCAL === 'true'
}

// O que o sistema exige e oferece de fotos agora. Se o armazenamento não está pronto,
// nada é exigido (senão a plataforma travaria: ninguém conseguiria doar nem reservar).
export function photoPolicy() {
  const enabled = isStorageReady()
  return { enabled, offerRequired: enabled && env.REQUIRE_OFFER_PHOTO, pickupRequired: enabled && env.REQUIRE_PICKUP_PHOTO }
}

export function createStorage(): StorageDriver {
  return env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY ? new SupabaseStorageDriver() : new LocalStorageDriver()
}

let current: StorageDriver | null = null
export function getStorage(): StorageDriver {
  if (!current && !isStorageReady()) {
    throw new AppError('O envio de fotos ainda não está configurado neste ambiente. Avise a administração.', 503)
  }
  current ??= createStorage()
  return current
}

// Só para testes.
export function setStorage(driver: StorageDriver | null): void {
  current = driver
}
