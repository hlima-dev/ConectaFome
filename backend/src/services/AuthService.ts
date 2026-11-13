import bcrypt from 'bcryptjs'
import { ApprovalStatus, User } from '@prisma/client'
import { prisma } from '../config/prisma'
import { env } from '../config/env'
import { geocoder } from './GeocodingService'
import { NotificationService } from './NotificationService'
import { generateTokenPair, verifyRefreshToken } from '../utils/jwt'
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../utils/AppError'

interface DonorProfileInput {
  name: string
  type: 'MERCADO' | 'RESTAURANTE' | 'FEIRA' | 'OUTRO'
  document?: string
  contactName?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
}

interface RecipientProfileInput {
  name: string
  type: 'ONG' | 'FAMILIA'
  document?: string
  contactName?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  peopleServed?: number
}

interface RegisterInput {
  name: string
  email: string
  password: string
  phone?: string
  role: 'DOADOR' | 'RECEPTOR'
  donor?: DonorProfileInput
  recipient?: RecipientProfileInput
}

interface LoginInput {
  email: string
  password: string
}

// Bloqueio por força bruta na própria conta — complementa o authLimiter
// (que só limita por IP e não impede alguém de trocar de IP a cada
// tentativa contra a mesma conta).
const MAX_FAILED_LOGIN_ATTEMPTS = 5
const LOCKOUT_DURATION_MS = 1000 * 60 * 15 // 15 minutos

export class AuthService {
  private notifications = new NotificationService()

  // Cadastro público — só DOADOR ou RECEPTOR (conta ADMIN nasce só via
  // seed, nunca por aqui). Cria o User e o perfil (Donor/Recipient)
  // vinculado na mesma transação, senão um login sem perfil ficaria "preso"
  // sem conseguir usar a plataforma.
  async register(input: RegisterInput) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } })
    if (existing) {
      throw new ConflictError('E-mail já cadastrado')
    }

    if (input.role === 'DOADOR' && !input.donor) {
      throw new ValidationError('Dados do doador são obrigatórios')
    }
    if (input.role === 'RECEPTOR' && !input.recipient) {
      throw new ValidationError('Dados do receptor são obrigatórios')
    }

    const passwordHash = await bcrypt.hash(input.password, env.BCRYPT_SALT_ROUNDS)

    const profiles: { kind: 'donor' | 'recipient'; id: string }[] = []

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          name: input.name,
          email: input.email,
          password: passwordHash,
          phone: input.phone,
          role: input.role,
          approvalStatus: env.REQUIRE_APPROVAL ? ApprovalStatus.PENDENTE : ApprovalStatus.APROVADO,
        },
      })

      if (input.role === 'DOADOR' && input.donor) {
        const donor = await tx.donor.create({
          data: { ...input.donor, userId: created.id },
        })
        profiles.push({ kind: 'donor', id: donor.id })
      }

      if (input.role === 'RECEPTOR' && input.recipient) {
        const recipient = await tx.recipient.create({
          data: { ...input.recipient, userId: created.id },
        })
        profiles.push({ kind: 'recipient', id: recipient.id })
      }

      return created
    })

    // Coordenadas do endereço, em segundo plano (melhor esforço).
    for (const profile of profiles) void geocoder.geocodeStoredProfile(profile.kind, profile.id)

    if (env.REQUIRE_APPROVAL) {
      const isDonor = input.role === 'DOADOR'
      void this.notifications.notifyAdmins(
        `Novo cadastro aguardando aprovação: ${input.donor?.name ?? input.recipient?.name} (${isDonor ? 'doador' : 'receptor'}).`,
        isDonor ? '/doadores' : '/receptores',
      )
    }

    return this.issueSession(user)
  }

  private async issueSession(user: User) {
    const tokens = generateTokenPair({ sub: user.id, role: user.role })

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    })

    // Recarrega com os perfis vinculados: o front usa donorProfile/
    // recipientProfile logo após o login/registro pra saber se quem está
    // logado é dono de uma doação (sem esperar uma segunda chamada a /me).
    const safeUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        active: true,
        approvalStatus: true,
        approvalNote: true,
        createdAt: true,
        donorProfile: true,
        recipientProfile: true,
      },
    })

    return { user: safeUser, ...tokens }
  }

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } })

    // Mesmo erro independente de o usuário existir — evita user enumeration.
    if (!user) {
      throw new UnauthorizedError('E-mail ou senha inválidos')
    }

    if (!user.active) {
      throw new UnauthorizedError('Conta inativa. Entre em contato com o suporte.')
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new UnauthorizedError(
        'Conta temporariamente bloqueada por excesso de tentativas. Tente novamente em alguns minutos.',
      )
    }

    const passwordMatch = await bcrypt.compare(input.password, user.password)

    if (!passwordMatch) {
      const attempts = user.failedLoginAttempts + 1
      const lockingNow = attempts >= MAX_FAILED_LOGIN_ATTEMPTS

      await prisma.user.update({
        where: { id: user.id },
        data: {
          failedLoginAttempts: lockingNow ? 0 : attempts,
          lockedUntil: lockingNow ? new Date(Date.now() + LOCKOUT_DURATION_MS) : null,
        },
      })

      throw new UnauthorizedError('E-mail ou senha inválidos')
    }

    if (user.failedLoginAttempts > 0 || user.lockedUntil) {
      await prisma.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      })
    }

    return this.issueSession(user)
  }

  async refreshToken(token: string) {
    const payload = verifyRefreshToken(token)

    const user = await prisma.user.findFirst({
      where: { id: payload.sub, refreshToken: token },
    })

    if (!user) {
      throw new UnauthorizedError('Refresh token inválido ou revogado')
    }

    const tokens = generateTokenPair({ sub: user.id, role: user.role })

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: tokens.refreshToken },
    })

    return tokens
  }

  async logout(userId: string) {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    })
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      throw new NotFoundError('Usuário')
    }

    const passwordMatch = await bcrypt.compare(currentPassword, user.password)
    if (!passwordMatch) {
      throw new UnauthorizedError('Senha atual incorreta')
    }

    const passwordHash = await bcrypt.hash(newPassword, env.BCRYPT_SALT_ROUNDS)

    await prisma.user.update({
      where: { id: userId },
      data: {
        password: passwordHash,
        refreshToken: null, // força novo login em outros dispositivos
      },
    })

    return { message: 'Senha alterada com sucesso.' }
  }

  async updateProfile(userId: string, input: { name?: string; phone?: string }) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: input,
      select: { id: true, name: true, email: true, role: true, phone: true, createdAt: true },
    })

    return user
  }

  async me(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        phone: true,
        active: true,
        approvalStatus: true,
        approvalNote: true,
        createdAt: true,
        donorProfile: true,
        recipientProfile: true,
      },
    })

    if (!user) {
      throw new NotFoundError('Usuário')
    }

    return user
  }
}
