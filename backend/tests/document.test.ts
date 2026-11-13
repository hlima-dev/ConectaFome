import { describe, it, expect } from 'vitest'
import { formatDocument, isValidCnpj, isValidCpf, isValidDocument, onlyDigits } from '../src/utils/document'
import { optionalDocument, requiredDocument } from '../src/utils/validation'

describe('CPF e CNPJ', () => {
  it('aceita CPF válido, com ou sem pontuação', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
    expect(isValidCpf('52998224725')).toBe(true)
  })

  it('rejeita CPF com dígito errado, sequência repetida ou tamanho incorreto', () => {
    expect(isValidCpf('529.982.247-24')).toBe(false)
    expect(isValidCpf('111.111.111-11')).toBe(false)
    expect(isValidCpf('123')).toBe(false)
  })

  it('aceita CNPJ válido e rejeita inválido', () => {
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true)
    expect(isValidCnpj('11.444.777/0001-61')).toBe(true)
    expect(isValidCnpj('11.222.333/0001-80')).toBe(false)
    expect(isValidCnpj('00.000.000/0000-00')).toBe(false)
  })

  it('isValidDocument aceita um ou outro', () => {
    expect(isValidDocument('529.982.247-25')).toBe(true)
    expect(isValidDocument('11.222.333/0001-81')).toBe(true)
    expect(isValidDocument('abc')).toBe(false)
  })

  it('formata para exibição e extrai dígitos', () => {
    expect(formatDocument('52998224725')).toBe('529.982.247-25')
    expect(formatDocument('11222333000181')).toBe('11.222.333/0001-81')
    expect(onlyDigits('11.222.333/0001-81')).toBe('11222333000181')
  })
})

describe('schemas de documento', () => {
  it('opcional: vazio vira ausente, válido é padronizado, inválido é rejeitado', () => {
    expect(optionalDocument.parse('')).toBeUndefined()
    expect(optionalDocument.parse(undefined)).toBeUndefined()
    expect(optionalDocument.parse('52998224725')).toBe('529.982.247-25')
    expect(() => optionalDocument.parse('123')).toThrow()
  })

  it('obrigatório: ausente ou inválido é rejeitado', () => {
    expect(() => requiredDocument.parse(undefined)).toThrow()
    expect(() => requiredDocument.parse('111.111.111-11')).toThrow()
    expect(requiredDocument.parse('11222333000181')).toBe('11.222.333/0001-81')
  })
})
