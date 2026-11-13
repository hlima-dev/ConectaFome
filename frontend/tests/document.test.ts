import { describe, expect, it } from 'vitest'
import { isValidCnpj, isValidCpf, isValidDocument, maskDocument } from '../src/utils/document'

describe('documento (CPF/CNPJ)', () => {
  it('valida CPF e CNPJ pelos dígitos verificadores', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('529.982.247-24')).toBe(false)
    expect(isValidCpf('111.111.111-11')).toBe(false)
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false)
    expect(isValidDocument('abc')).toBe(false)
  })

  it('máscara de CPF e de CNPJ enquanto digita', () => {
    expect(maskDocument('52998224725')).toBe('529.982.247-25')
    expect(maskDocument('529')).toBe('529')
    expect(maskDocument('5299')).toBe('529.9')
    expect(maskDocument('11222333000181')).toBe('11.222.333/0001-81')
  })
})
