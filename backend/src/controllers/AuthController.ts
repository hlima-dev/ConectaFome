import { Request, Response } from 'express'
import { z } from 'zod'
import { AuthService } from '../services/AuthService'
import { successResponse } from '../utils/pagination'
import { setAuthCookies, clearAuthCookies, REFRESH_COOKIE } from '../utils/authCookies'
import { UnauthorizedError } from '../utils/AppError'
import { requiredDocument } from '../utils/validation'

const authService = new AuthService()

const passwordSchema = z
  .string()
  .min(8, 'Senha deve ter ao menos 8 caracteres')
  .regex(/[A-Z]/, 'Senha deve conter ao menos uma letra maiúscula')
  .regex(/[0-9]/, 'Senha deve conter ao menos um número')

const donorProfileSchema = z.object({
  name: z.string().min(2, 'Nome do doador é obrigatório'),
  type: z.enum(['MERCADO', 'RESTAURANTE', 'FEIRA', 'OUTRO']).default('OUTRO'),
  document: requiredDocument,
  contactName: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
})

const recipientProfileSchema = z.object({
  name: z.string().min(2, 'Nome do receptor é obrigatório'),
  type: z.enum(['ONG', 'FAMILIA']).default('ONG'),
  document: requiredDocument,
  contactName: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  peopleServed: z.coerce.number().int().positive().optional(),
})

// Cadastro público só permite DOADOR/RECEPTOR — conta ADMIN nasce só via seed.
const registerSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  email: z.string().email('E-mail inválido'),
  password: passwordSchema,
  phone: z.string().optional(),
  role: z.enum(['DOADOR', 'RECEPTOR']),
  donor: donorProfileSchema.optional(),
  recipient: recipientProfileSchema.optional(),
})

const forgotSchema = z.object({ email: z.string().email('E-mail inválido') })
const resetSchema = z.object({ token: z.string().min(20), password: passwordSchema })

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Senha atual obrigatória'),
  newPassword: passwordSchema,
})

const updateProfileSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres').optional(),
  phone: z.string().optional(),
})

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const data = registerSchema.parse(req.body)
    const { user, accessToken, refreshToken } = await authService.register(data)
    const csrfToken = setAuthCookies(res, { accessToken, refreshToken })
    res.status(201).json(successResponse({ user, csrfToken }, 'Cadastro realizado com sucesso'))
  }

  async login(req: Request, res: Response): Promise<void> {
    const data = loginSchema.parse(req.body)
    const { user, accessToken, refreshToken } = await authService.login(data)
    const csrfToken = setAuthCookies(res, { accessToken, refreshToken })
    res.json(successResponse({ user, csrfToken }))
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const token = req.cookies?.[REFRESH_COOKIE]
    if (!token) {
      throw new UnauthorizedError('Refresh token não encontrado')
    }

    const tokens = await authService.refreshToken(token)
    const csrfToken = setAuthCookies(res, tokens)
    res.json(successResponse({ csrfToken }))
  }

  async logout(req: Request, res: Response): Promise<void> {
    if (req.user) {
      await authService.logout(req.user.id)
    }
    clearAuthCookies(res)
    res.json(successResponse(null, 'Sessão encerrada'))
  }

  async me(req: Request, res: Response): Promise<void> {
    const user = await authService.me(req.user!.id)
    res.json(successResponse(user))
  }

  async updateProfile(req: Request, res: Response): Promise<void> {
    const data = updateProfileSchema.parse(req.body)
    const user = await authService.updateProfile(req.user!.id, data)
    res.json(successResponse(user, 'Perfil atualizado'))
  }

  async changePassword(req: Request, res: Response): Promise<void> {
    const data = changePasswordSchema.parse(req.body)
    const result = await authService.changePassword(req.user!.id, data.currentPassword, data.newPassword)
    res.json(successResponse(null, result.message))
  }

  async forgotPassword(req: Request, res: Response): Promise<void> {
    const { email } = forgotSchema.parse(req.body)
    await authService.forgotPassword(email)
    // Resposta única: não revela se o e-mail tem cadastro.
    res.json(successResponse(null, 'Se houver uma conta com esse e-mail, enviamos o link para criar uma nova senha.'))
  }

  async resetPassword(req: Request, res: Response): Promise<void> {
    const { token, password } = resetSchema.parse(req.body)
    await authService.resetPassword(token, password)
    res.json(successResponse(null, 'Senha redefinida. Entre com a nova senha.'))
  }

  async adminResetLink(req: Request, res: Response): Promise<void> {
    const result = await authService.createResetLinkForUser(String(req.params.userId))
    res.json(successResponse(result, 'Link gerado. Envie à pessoa; vale por 1 hora.'))
  }
}
