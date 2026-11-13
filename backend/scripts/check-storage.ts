// Confere, de verdade, se o armazenamento de fotos está funcionando: grava uma
// imagem minúscula, lê de volta, compara e apaga. Rode com as mesmas variáveis do servidor:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npm run storage:check
import sharp from 'sharp'
import { getStorage, isStorageReady } from '../src/storage/StorageDriver'
import { env } from '../src/config/env'

async function main() {
  const driver = env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY ? 'Supabase Storage' : 'disco local'
  console.log(`Armazenamento: ${driver}${env.SUPABASE_URL ? ` (bucket "${env.SUPABASE_BUCKET}")` : ''}`)
  if (!isStorageReady()) {
    console.error('NÃO configurado: defina SUPABASE_URL e SUPABASE_SERVICE_KEY (veja o DEPLOY.md).')
    process.exit(1)
  }

  const storage = getStorage()
  const key = `check/teste-${Date.now()}.webp`
  const image = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#047857' } }).webp().toBuffer()

  await storage.put(key, image, 'image/webp')
  console.log('1/3 gravou a foto de teste')

  const back = await storage.get(key)
  if (!back.data.equals(image)) throw new Error('A foto lida não é igual à gravada')
  console.log(`2/3 leu de volta (${back.data.length} bytes, ${back.contentType})`)

  await storage.remove(key)
  console.log('3/3 apagou a foto de teste')
  console.log('\nOK: o armazenamento de fotos está funcionando.')
}

main().catch((error) => {
  console.error('\nFALHOU:', error instanceof Error ? error.message : error)
  console.error('Confira: URL do projeto, a chave secreta (service/secret) e se o bucket existe e é PRIVADO.')
  process.exit(1)
})
