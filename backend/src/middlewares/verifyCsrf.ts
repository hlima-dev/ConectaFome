import { NextFunction, Request, Response } from 'express'
import { ForbiddenError } from '../utils/AppError'
import { CSRF_COOKIE } from '../utils/authCookies'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const AUTH_ENTRY_PATHS = new Set([
  '/api/v1/auth/login',
  '/api/v1/auth/register',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  // Formulário público de voluntários: quem o envia não está logado e pode ter um cookie antigo.
  '/api/v1/public/volunteers/apply',
])

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

  // Entrada na conta: login, cadastro e recuperação de senha. Não dependem de sessão e
  // são justamente o passo que CRIA os cookies novos. Sem esta exceção, um cookie CSRF
  // antigo que ficou no navegador (a sessão expirou e o site só consegue limpar o que
  // guarda localmente, não os cookies protegidos) travava o login com "Token CSRF
  // inválido" até a pessoa limpar os cookies.
  if (AUTH_ENTRY_PATHS.has((req.originalUrl ?? req.path ?? '').split('?')[0])) {
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
