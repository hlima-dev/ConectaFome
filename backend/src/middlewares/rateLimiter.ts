import rateLimit from 'express-rate-limit'
import { env } from '../config/env'

export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Muitas requisições. Tente novamente em 15 minutos.' },
})

export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Muitas tentativas de login. Aguarde 15 minutos.' },
})

// Rotas do link de campo (sem login): mais folgado que o de autenticação, porque o
// voluntário envia várias fotos seguidas, mas ainda limitado por IP.
export const fieldLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.RATE_LIMIT_MAX * 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Muitas requisições. Aguarde alguns minutos.' },
})

// Formulário público de voluntários: poucas inscrições por hora e por IP, para não virar
// canal de spam (cada inscrição gera um aviso para a administração).
export const applyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: env.APPLY_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', message: 'Muitas inscrições deste endereço. Tente de novo mais tarde.' },
})
