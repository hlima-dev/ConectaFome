import sharp from 'sharp'
import { ValidationError } from './AppError'

// Tipos aceitos, conferidos pelos primeiros bytes do arquivo (o "Content-Type" que
// o cliente declara não é confiável).
export function detectImageType(buffer: Buffer): 'jpeg' | 'png' | 'webp' | null {
  if (buffer.length < 12) return null
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg'
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  return null
}

export interface ProcessedImage {
  data: Buffer
  width: number
  height: number
  mimeType: 'image/webp'
}

const MAX_SIDE = 1280
// Barra "bombas de descompressão" (imagem minúscula em bytes e gigante em pixels).
const MAX_PIXELS = 40_000_000

// Reencoda para WebP, no máximo 1280 px no lado maior, já com a orientação
// corrigida. Reencodar descarta os metadados (EXIF: localização GPS, modelo do
// aparelho), então a foto que fica guardada não revela onde a pessoa estava.
export async function processImage(buffer: Buffer): Promise<ProcessedImage> {
  if (!detectImageType(buffer)) {
    throw new ValidationError('Arquivo não reconhecido como imagem. Envie JPG, PNG ou WebP.')
  }
  try {
    const { data, info } = await sharp(buffer, { limitInputPixels: MAX_PIXELS, failOn: 'error' })
      .rotate()
      .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer({ resolveWithObject: true })
    return { data, width: info.width, height: info.height, mimeType: 'image/webp' }
  } catch {
    throw new ValidationError('Não foi possível ler esta imagem. Tente tirar a foto de novo.')
  }
}
