import { describe, it, expect, vi } from 'vitest'
import { Request, Response } from 'express'
import { verifyCsrf } from '../src/middlewares/verifyCsrf'
import { CSRF_COOKIE } from '../src/utils/authCookies'
import { ForbiddenError } from '../src/utils/AppError'

function fakeReq(overrides: Partial<Request>): Request {
  return { method: 'GET', headers: {}, cookies: {}, ...overrides } as unknown as Request
}

describe('middlewares/verifyCsrf', () => {
  it('deixa passar métodos seguros (GET) mesmo sem token', () => {
    const req = fakeReq({ method: 'GET' })
    const next = vi.fn()
    verifyCsrf(req, {} as Response, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('deixa passar uma escrita quando não há cookie CSRF ainda (ex.: login)', () => {
    const req = fakeReq({ method: 'POST', cookies: {} })
    const next = vi.fn()
    verifyCsrf(req, {} as Response, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('bloqueia uma escrita quando o header não bate com o cookie', () => {
    const req = fakeReq({
      method: 'POST',
      cookies: { [CSRF_COOKIE]: 'valor-do-cookie' },
      headers: { 'x-csrf-token': 'valor-diferente' },
    })
    const next = vi.fn()
    expect(() => verifyCsrf(req, {} as Response, next)).toThrow(ForbiddenError)
    expect(next).not.toHaveBeenCalled()
  })

  it('bloqueia uma escrita quando falta o header por completo', () => {
    const req = fakeReq({
      method: 'DELETE',
      cookies: { [CSRF_COOKIE]: 'valor-do-cookie' },
      headers: {},
    })
    expect(() => verifyCsrf(req, {} as Response, vi.fn())).toThrow(ForbiddenError)
  })

  it('libera quando o header bate com o cookie', () => {
    const req = fakeReq({
      method: 'PATCH',
      cookies: { [CSRF_COOKIE]: 'token-123' },
      headers: { 'x-csrf-token': 'token-123' },
    })
    const next = vi.fn()
    verifyCsrf(req, {} as Response, next)
    expect(next).toHaveBeenCalledOnce()
  })

  it('login, cadastro e recuperação de senha passam mesmo com um cookie CSRF antigo e sem cabeçalho', () => {
    for (const url of ['/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/auth/forgot-password', '/api/v1/auth/reset-password?x=1', '/api/v1/public/volunteers/apply']) {
      const req = fakeReq({ method: 'POST', originalUrl: url, cookies: { [CSRF_COOKIE]: 'cookie-antigo' } })
      const next = vi.fn()
      verifyCsrf(req, {} as Response, next)
      expect(next).toHaveBeenCalledOnce()
    }
  })

  it('as demais escritas continuam protegidas, inclusive as da própria conta', () => {
    for (const url of ['/api/v1/auth/logout', '/api/v1/auth/change-password', '/api/v1/donations', '/api/v1/auth/login/../donations']) {
      const req = fakeReq({ method: 'POST', originalUrl: url, cookies: { [CSRF_COOKIE]: 'cookie-antigo' } })
      expect(() => verifyCsrf(req, {} as Response, vi.fn())).toThrow(ForbiddenError)
    }
  })
})
