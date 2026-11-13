import { api } from './api'
import type { AuthResponse, LoginInput, RegisterInput, User } from '../types/auth'

export async function login(data: LoginInput): Promise<AuthResponse> {
  const response = await api.post('/auth/login', data)
  return response.data.data
}

export async function register(data: RegisterInput): Promise<AuthResponse> {
  const response = await api.post('/auth/register', data)
  return response.data.data
}

export async function forgotPassword(email: string): Promise<string> {
  const response = await api.post('/auth/forgot-password', { email })
  return response.data.message
}

export async function resetPassword(token: string, password: string): Promise<string> {
  const response = await api.post('/auth/reset-password', { token, password })
  return response.data.message
}

export async function createResetLink(userId: string): Promise<{ link: string; expiresAt: string }> {
  const response = await api.post(`/auth/users/${userId}/reset-link`)
  return response.data.data
}

export async function me(): Promise<User> {
  const response = await api.get('/auth/me')
  return response.data.data
}

export async function updateProfile(data: { name?: string; phone?: string }): Promise<User> {
  const response = await api.patch('/auth/me', data)
  return response.data.data
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const response = await api.patch('/auth/change-password', { currentPassword, newPassword })
  return response.data
}

// Os tokens são cookies httpOnly — só limpar o localStorage não os invalida
// no navegador. Precisa chamar o backend para ele mandar o Set-Cookie de
// expiração.
export async function logout(): Promise<void> {
  try {
    await api.post('/auth/logout')
  } catch {
    // segue o fluxo de limpeza local mesmo se a chamada falhar
  } finally {
    clearSession()
  }
}

export function saveSession(auth: AuthResponse): void {
  localStorage.setItem('@conectfome:csrf', auth.csrfToken)
  localStorage.setItem('@conectfome:user', JSON.stringify(auth.user))
}

export function clearSession(): void {
  localStorage.removeItem('@conectfome:csrf')
  localStorage.removeItem('@conectfome:user')
}

// Sinal do lado do cliente de que provavelmente existe uma sessão ativa
// (usado só para decidir rotas no front). A segurança de verdade está no
// cookie httpOnly, que o JS não enxerga — se ele tiver expirado, a
// primeira chamada à API vai devolver 401 e redirecionar pro login.
export function hasStoredSession(): boolean {
  return !!localStorage.getItem('@conectfome:csrf')
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem('@conectfome:user')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}
