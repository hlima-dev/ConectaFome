import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http, { IncomingMessage } from 'node:http'
import { mkdtemp, readdir, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { LocalStorageDriver, SupabaseStorageDriver } from '../src/storage/StorageDriver'

describe('LocalStorageDriver', () => {
  let dir: string
  beforeAll(async () => { dir = await mkdtemp(path.join(os.tmpdir(), 'cf-storage-')) })
  afterAll(async () => { await rm(dir, { recursive: true, force: true }) })

  it('grava, lê e apaga', async () => {
    const driver = new LocalStorageDriver(dir)
    await driver.put('donations/abc/oferta-1.webp', Buffer.from('conteudo'))
    expect((await driver.get('donations/abc/oferta-1.webp')).data.toString()).toBe('conteudo')
    await driver.remove('donations/abc/oferta-1.webp')
    await expect(driver.get('donations/abc/oferta-1.webp')).rejects.toThrow()
    expect(await readdir(path.join(dir, 'donations/abc'))).toEqual([])
  })

  it('recusa chave que tente sair da pasta ou com extensão estranha', async () => {
    const driver = new LocalStorageDriver(dir)
    for (const key of ['../fora.webp', 'donations/../../etc/passwd.webp', '/etc/hosts.webp', 'a/b.php', 'a b/c.webp']) {
      await expect(driver.put(key, Buffer.from('x'))).rejects.toThrow(/Chave de armazenamento inválida/)
    }
  })
})

describe('SupabaseStorageDriver (servidor HTTP falso)', () => {
  let server: http.Server
  let base: string
  const calls: { method: string; url: string; headers: IncomingMessage['headers']; body: string }[] = []
  let status = 200

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        calls.push({ method: req.method!, url: req.url!, headers: req.headers, body: Buffer.concat(chunks).toString() })
        res.writeHead(status, { 'Content-Type': 'image/webp' })
        res.end(req.method === 'GET' ? 'bytes-da-foto' : '{}')
      })
    })
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())))

  it('grava com POST em /object/<bucket>/<chave>, chave nova só em "apikey" (sem Authorization)', async () => {
    calls.length = 0
    await new SupabaseStorageDriver(base, 'sb_secret_abcdefghijklmnopqrstuvwxyz', 'doacoes').put('donations/d1/oferta-x.webp', Buffer.from('IMG'), 'image/webp')
    const call = calls[0]
    expect(call.method).toBe('POST')
    expect(call.url).toBe('/storage/v1/object/doacoes/donations/d1/oferta-x.webp')
    expect(call.headers.apikey).toBe('sb_secret_abcdefghijklmnopqrstuvwxyz')
    expect(call.headers.authorization).toBeUndefined()
    expect(call.headers['content-type']).toBe('image/webp')
    expect(call.headers['x-upsert']).toBe('false')
    expect(call.body).toBe('IMG')
  })

  it('chave antiga (JWT) também vai em Authorization: Bearer', async () => {
    calls.length = 0
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura'
    await new SupabaseStorageDriver(base, jwt, 'doacoes').put('a/b.webp', Buffer.from('x'), 'image/webp')
    expect(calls[0].headers.authorization).toBe(`Bearer ${jwt}`)
  })

  it('lê pela rota autenticada (bucket privado) e apaga com DELETE', async () => {
    calls.length = 0
    const driver = new SupabaseStorageDriver(base, 'sb_secret_abcdefghijklmnopqrstuvwxyz', 'doacoes')
    const got = await driver.get('donations/d1/oferta-x.webp')
    expect(calls[0].url).toBe('/storage/v1/object/authenticated/doacoes/donations/d1/oferta-x.webp')
    expect(got.data.toString()).toBe('bytes-da-foto')
    expect(got.contentType).toBe('image/webp')

    await driver.remove('donations/d1/oferta-x.webp')
    expect(calls[1].method).toBe('DELETE')
  })

  it('erro do armazenamento vira falha clara; apagar o que não existe (404) não é erro', async () => {
    const driver = new SupabaseStorageDriver(base, 'sb_secret_abcdefghijklmnopqrstuvwxyz', 'doacoes')
    status = 500
    await expect(driver.put('a/b.webp', Buffer.from('x'), 'image/webp')).rejects.toThrow(/HTTP 500/)
    status = 404
    await expect(driver.remove('a/b.webp')).resolves.toBeUndefined()
    status = 200
  })
})
