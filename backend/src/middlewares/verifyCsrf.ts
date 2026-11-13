import { NextFunction, Request, Response } from 'express'
import { ForbiddenError } from '../utils/AppError'
import { CSRF_COOKIE } from '../utils/authCookies'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

// Proteção CSRF por dupla submissão: o valor do cookie conectfome_csrf
// (httpOnly, setado no login) precisa bater com o header X-CSRF-Token que
// o front ecoa a partir do que recebeu no corpo da resposta de login. Um
// site atacante não consegue ler nem um nem o outro, então não monta o par
// certo — mesmo que o navegador envie o cookie de sessão automaticamente.
export function verifyCsrf(req: Request, res: Response, next: NextFunction): void {
  if (SAFE_METHODS.has(req.method)) {
    next()
    return
  }

  // Link de campo: autorizado pelo token no caminho, não por cookie — não há o que forjar.
  if ((req.originalUrl ?? req.path ?? '').startsWith('/api/v1/field/')) {
    next()
    return
  }

  // Sem cookie de sessão ainda (ex.: login, registro, refresh) — nada para
  // validar, essas rotas não usam o cookie de acesso para autenticar.
  const cookieToken = req.cookies?.[CSRF_COOKIE]
  if (!cookieToken) {
    next()
    return
  }

  const headerToken = req.headers['x-csrf-token']

  if (!headerToken || headerToken !== cookieToken) {
    throw new ForbiddenError('Token CSRF inválido ou ausente')
  }

  next()
}
