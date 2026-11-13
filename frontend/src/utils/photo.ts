// Reduz a foto no próprio celular antes de enviar: foto de câmera tem 3 a 8 MB e o
// 4G do campo é lento. Redesenhar no canvas também descarta os metadados (GPS).
// Se o navegador não conseguir (formato estranho, sem canvas), manda o original;
// o servidor reduz e confere de qualquer jeito.
const MAX_SIDE = 1600
const QUALITY = 0.82

export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || typeof createImageBitmap !== 'function') return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
    // Se a versão reduzida não ficou menor (foto já leve), mantém a original.
    if (!blob || blob.size >= file.size) return file
    return new File([blob], 'foto.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}
