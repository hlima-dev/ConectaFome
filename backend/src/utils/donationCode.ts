import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env'

// Número curto para citar a doação: DOA-00042.
export const donationCode = (number: number) => `DOA-${String(number).padStart(5, '0')}`

// Aceita "DOA-00042", "doa 42" ou só "42". Devolve o número ou null.
export function parseDonationCode(text: string): number | null {
  const match = text.trim().match(/^(?:doa[\s-]*)?0*(\d{1,9})$/i)
  return match ? Number(match[1]) : null
}

// Assinatura do comprovante: vai no QR code. Quem tem o código mas não a assinatura não
// consegue "inventar" a página de verificação de outro comprovante.
export function receiptSignature(code: string): string {
  return createHmac('sha256', env.JWT_SECRET).update(`receipt:${code}`).digest('hex').slice(0, 20)
}

export function isValidReceiptSignature(code: string, signature: string): boolean {
  const expected = Buffer.from(receiptSignature(code))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
