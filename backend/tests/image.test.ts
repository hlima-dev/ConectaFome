import { describe, it, expect } from 'vitest'
import sharp from 'sharp'
import { detectImageType, processImage } from '../src/utils/image'
import { ValidationError } from '../src/utils/AppError'

const jpegWithGps = (w = 3000, h = 2000) =>
  sharp({ create: { width: w, height: h, channels: 3, background: '#2f855a' } })
    .withExif({ IFD0: { Make: 'CelularSecreto', Model: 'X1' }, IFD3: { GPSLatitudeRef: 'S' } })
    .jpeg()
    .toBuffer()

describe('tratamento de imagem', () => {
  it('reconhece JPEG, PNG e WebP pelos primeiros bytes e rejeita o resto', async () => {
    expect(detectImageType(await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).jpeg().toBuffer())).toBe('jpeg')
    expect(detectImageType(await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).png().toBuffer())).toBe('png')
    expect(detectImageType(await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).webp().toBuffer())).toBe('webp')
    expect(detectImageType(Buffer.from('<?php echo 1; ?> não sou imagem de verdade'))).toBeNull()
    expect(detectImageType(Buffer.from('%PDF-1.7 ........'))).toBeNull()
  })

  it('reduz para no máximo 1280 px, vira WebP e descarta os metadados (EXIF/GPS)', async () => {
    const original = await jpegWithGps()
    expect((await sharp(original).metadata()).exif).toBeDefined()

    const out = await processImage(original)

    expect(out.mimeType).toBe('image/webp')
    expect(Math.max(out.width, out.height)).toBe(1280)
    expect(out.width).toBe(1280)
    expect(out.height).toBe(853)
    const meta = await sharp(out.data).metadata()
    expect(meta.format).toBe('webp')
    expect(meta.exif).toBeUndefined()
    expect(out.data.length).toBeLessThan(original.length)
  })

  it('não amplia imagem pequena', async () => {
    const small = await sharp({ create: { width: 200, height: 100, channels: 3, background: '#fff' } }).png().toBuffer()
    const out = await processImage(small)
    expect([out.width, out.height]).toEqual([200, 100])
  })

  it('arquivo que não é imagem, mesmo com cabeçalho falso de imagem quebrado, é recusado com mensagem clara', async () => {
    await expect(processImage(Buffer.from('isto não é uma imagem, é texto comum'))).rejects.toBeInstanceOf(ValidationError)
    const fakeJpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('lixo lixo lixo lixo lixo lixo')])
    await expect(processImage(fakeJpeg)).rejects.toThrow(/Não foi possível ler/)
  })
})
