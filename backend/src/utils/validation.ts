import { z } from 'zod'
import { formatDocument, isValidDocument } from './document'

// Campo de e-mail opcional que tolera string vazia ("") vindo de formulários
// do frontend — sem isso, z.string().email().optional() rejeita "" porque
// .optional() só aceita ausência/undefined, não string vazia.
export const optionalEmail = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().email().optional(),
)

// Coerção de data que tolera string vazia — usada em campos opcionais de
// data (ex: validade de uma doação).
export const optionalDate = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.coerce.date().optional(),
)

const documentMessage = 'Documento inválido: informe um CPF ou CNPJ válido'

// CPF/CNPJ opcional (aceita "" do formulário) e, quando informado, válido.
// Sai padronizado (com pontuação) para o cadastro ficar uniforme.
export const optionalDocument = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z
    .string()
    .refine(isValidDocument, documentMessage)
    .transform(formatDocument)
    .optional(),
)

// CPF/CNPJ obrigatório e válido (cadastro público).
export const requiredDocument = z
  .string({ error: 'Informe o CPF ou CNPJ' })
  .refine(isValidDocument, documentMessage)
  .transform(formatDocument)
