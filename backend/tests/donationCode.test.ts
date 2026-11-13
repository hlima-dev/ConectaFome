import { describe, it, expect } from 'vitest'
import { donationCode, isValidReceiptSignature, parseDonationCode, receiptSignature } from '../src/utils/donationCode'

describe('código da doação', () => {
  it('formata com zeros à esquerda', () => {
    expect(donationCode(1)).toBe('DOA-00001')
    expect(donationCode(42)).toBe('DOA-00042')
    expect(donationCode(123456)).toBe('DOA-123456')
  })

  it('lê o código em formatos comuns de digitação', () => {
    expect(parseDonationCode('DOA-00042')).toBe(42)
    expect(parseDonationCode('doa 42')).toBe(42)
    expect(parseDonationCode(' 42 ')).toBe(42)
    expect(parseDonationCode('doa42')).toBe(42)
  })

  it('texto comum não vira código (a busca cai para descrição e nomes)', () => {
    expect(parseDonationCode('pães')).toBeNull()
    expect(parseDonationCode('doa pães')).toBeNull()
    expect(parseDonationCode('')).toBeNull()
    expect(parseDonationCode('12345678901234')).toBeNull()
  })

  it('assinatura do comprovante: só vale para o código a que pertence', () => {
    const sig = receiptSignature('DOA-00042')
    expect(sig).toMatch(/^[0-9a-f]{20}$/)
    expect(isValidReceiptSignature('DOA-00042', sig)).toBe(true)
    expect(isValidReceiptSignature('DOA-00043', sig)).toBe(false)
    expect(isValidReceiptSignature('DOA-00042', 'x'.repeat(20))).toBe(false)
    expect(isValidReceiptSignature('DOA-00042', '')).toBe(false)
  })
})
