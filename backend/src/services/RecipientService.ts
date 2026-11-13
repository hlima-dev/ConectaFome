import { ApprovalStatus, RecipientType, Role } from '@prisma/client'
import { prisma } from '../config/prisma'
import { ForbiddenError, NotFoundError } from '../utils/AppError'
import { paginate, PaginationParams } from '../utils/pagination'
import { geocoder, touchesAddress } from './GeocodingService'

interface CreateRecipientInput {
  name: string
  type?: RecipientType
  document?: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
  peopleServed?: number
}

type UpdateRecipientInput = Partial<CreateRecipientInput>

interface ListRecipientsFilter {
  includeInactive?: boolean
  search?: string
  approval?: ApprovalStatus
}

interface Requester {
  id: string
  role: Role
}

export class RecipientService {
  async create(input: CreateRecipientInput) {
    const created = await prisma.recipient.create({ data: input })
    // Sem await: a resposta não espera o serviço de mapas (melhor esforço).
    if (touchesAddress(input)) void geocoder.geocodeStoredProfile('recipient', created.id)
    return created
  }

  async findAll(filter: ListRecipientsFilter, pagination: PaginationParams) {
    const where = {
      ...(filter.includeInactive ? {} : { active: true }),
      ...(filter.approval && { user: { is: { approvalStatus: filter.approval } } }),
      ...(filter.search && {
        name: { contains: filter.search, mode: 'insensitive' as const },
      }),
    }

    const [recipients, total] = await Promise.all([
      prisma.recipient.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { name: 'asc' },
        include: { user: { select: { email: true, approvalStatus: true, approvalNote: true } } },
      }),
      prisma.recipient.count({ where }),
    ])

    return paginate(recipients, total, pagination)
  }

  async findById(id: string, requester: Requester) {
    const recipient = await prisma.recipient.findUnique({ where: { id } })
    if (!recipient) {
      throw new NotFoundError('Receptor')
    }

    this.assertAccess(recipient, requester)
    return recipient
  }

  async update(id: string, input: UpdateRecipientInput, requester: Requester) {
    const recipient = await this.findById(id, requester)
    // Endereço novo invalida as coordenadas antigas até a nova geocodificação.
    const addressChanged = touchesAddress(input)
    const updated = await prisma.recipient.update({
      where: { id: recipient.id },
      data: addressChanged ? { ...input, latitude: null, longitude: null } : input,
    })
    if (addressChanged) void geocoder.geocodeStoredProfile('recipient', updated.id)
    return updated
  }

  async deactivate(id: string) {
    const recipient = await prisma.recipient.findUnique({ where: { id } })
    if (!recipient) {
      throw new NotFoundError('Receptor')
    }
    await prisma.recipient.update({ where: { id }, data: { active: false } })
  }

  private assertAccess(recipient: { userId: string | null }, requester: Requester) {
    if (requester.role === Role.ADMIN) return
    if (requester.role === Role.RECEPTOR && recipient.userId === requester.id) return
    throw new ForbiddenError('Você só pode acessar seu próprio cadastro de receptor.')
  }
}
