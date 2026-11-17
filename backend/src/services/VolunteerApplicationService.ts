import { ApplicationStatus } from '@prisma/client'
import { prisma } from '../config/prisma'
import { ConflictError, NotFoundError, ValidationError } from '../utils/AppError'
import { formatDocument, isValidCpf, onlyDigits } from '../utils/document'
import { paginate, PaginationParams } from '../utils/pagination'
import { emailService } from './EmailService'
import { NotificationService } from './NotificationService'

export const AVAILABILITY = ['SEMANA_MANHA', 'SEMANA_TARDE', 'SEMANA_NOITE', 'FIM_DE_SEMANA'] as const
export type Availability = (typeof AVAILABILITY)[number]

export interface ApplicationInput {
  name: string
  phone: string
  email?: string
  city: string
  availability: Availability[]
  hasVehicle: boolean
  message?: string
}

export class VolunteerApplicationService {
  private notifications = new NotificationService()

  // Inscrição vinda do formulário público. Não cria conta nem voluntário: só entra na fila
  // da administração. Quem já tem inscrição pendente com o mesmo telefone não duplica.
  async submit(input: ApplicationInput) {
    const phone = onlyDigits(input.phone)
    const pending = await prisma.volunteerApplication.findFirst({ where: { phone, status: ApplicationStatus.PENDENTE } })
    if (pending) {
      throw new ConflictError('Já recebemos a sua inscrição. A equipe entra em contato assim que analisar.')
    }

    const created = await prisma.volunteerApplication.create({
      data: {
        name: input.name.trim(),
        phone,
        email: input.email?.trim().toLowerCase() || null,
        city: input.city.trim(),
        availability: input.availability,
        hasVehicle: input.hasVehicle,
        message: input.message?.trim() || null,
        consentAt: new Date(),
      },
      select: { id: true },
    })

    void this.notifications.notifyAdmins(`Nova inscrição de voluntário: ${input.name.trim()} (${input.city.trim()}).`, '/voluntarios?aba=inscricoes')
    return created
  }

  async list(filter: { status?: ApplicationStatus }, pagination: PaginationParams) {
    const where = filter.status ? { status: filter.status } : {}
    const [items, total] = await Promise.all([
      prisma.volunteerApplication.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        // Pendentes: as mais antigas primeiro (quem espera há mais tempo). Demais: as mais recentes.
        orderBy: { createdAt: filter.status === ApplicationStatus.PENDENTE ? 'asc' : 'desc' },
        include: { volunteer: { select: { id: true, name: true, active: true } } },
      }),
      prisma.volunteerApplication.count({ where }),
    ])
    return paginate(items, total, pagination)
  }

  async pendingCount() {
    return prisma.volunteerApplication.count({ where: { status: ApplicationStatus.PENDENTE } })
  }

  private async getPending(id: string) {
    const application = await prisma.volunteerApplication.findUnique({ where: { id } })
    if (!application) throw new NotFoundError('Inscrição')
    if (application.status !== ApplicationStatus.PENDENTE) {
      throw new ValidationError('Esta inscrição já foi analisada')
    }
    return application
  }

  // Aprovar cria o Voluntário (que as rotas usam). O CPF é informado aqui, pela administração,
  // porque o cadastro de voluntário o exige e o formulário público não o coleta.
  async approve(id: string, input: { document: string }) {
    const application = await this.getPending(id)
    if (!isValidCpf(input.document)) {
      throw new ValidationError('Informe um CPF válido do voluntário')
    }
    const document = formatDocument(input.document)

    const existing = await prisma.volunteer.findUnique({ where: { document } })
    if (existing) {
      throw new ConflictError(`Já existe um voluntário com este CPF (${existing.name}). Se for a mesma pessoa, não precisa aprovar de novo.`)
    }

    const volunteer = await prisma.$transaction(async (tx) => {
      const created = await tx.volunteer.create({ data: { name: application.name, document, phone: application.phone } })
      const result = await tx.volunteerApplication.updateMany({
        where: { id, status: ApplicationStatus.PENDENTE },
        data: { status: ApplicationStatus.APROVADA, reviewedAt: new Date(), volunteerId: created.id },
      })
      // Outra pessoa da administração decidiu no mesmo instante: desfaz.
      if (result.count === 0) throw new ConflictError('Esta inscrição acabou de ser analisada por outra pessoa')
      return created
    })

    if (application.email) {
      void emailService.send({
        to: application.email,
        subject: 'ConectaFome: sua inscrição de voluntário foi aprovada',
        text: `Olá, ${application.name}! Sua inscrição como voluntário foi aprovada. Em breve a equipe entra em contato, pelo telefone informado, para combinar a primeira coleta. Obrigado por ajudar!`,
      })
    }
    return volunteer
  }

  async reject(id: string, input: { note?: string }) {
    const application = await this.getPending(id)
    const updated = await prisma.volunteerApplication.updateMany({
      where: { id, status: ApplicationStatus.PENDENTE },
      data: { status: ApplicationStatus.RECUSADA, reviewNote: input.note?.trim() || null, reviewedAt: new Date() },
    })
    if (updated.count === 0) throw new ConflictError('Esta inscrição acabou de ser analisada por outra pessoa')

    if (application.email) {
      void emailService.send({
        to: application.email,
        subject: 'ConectaFome: sobre a sua inscrição de voluntário',
        text: `Olá, ${application.name}. Obrigado pelo interesse em ajudar! Neste momento não conseguimos incluir você nas coletas, mas guardamos o seu contato e podemos chamar quando houver uma vaga.`,
      })
    }
  }
}
