import { ApprovalStatus, DonorType, Role } from '@prisma/client'
import { prisma } from '../config/prisma'
import { ForbiddenError, NotFoundError } from '../utils/AppError'
import { paginate, PaginationParams } from '../utils/pagination'
import { geocoder, touchesAddress } from './GeocodingService'

interface CreateDonorInput {
  name: string
  type?: DonorType
  document?: string
  contactName?: string
  phone?: string
  email?: string
  address?: string
  city?: string
  state?: string
  zipCode?: string
}

type UpdateDonorInput = Partial<CreateDonorInput>

interface ListDonorsFilter {
  includeInactive?: boolean
  search?: string
  approval?: ApprovalStatus
}

interface Requester {
  id: string
  role: Role
}

export class DonorService {
  // Cadastro pelo admin — o outro jeito de virar doador é o cadastro
  // público (AuthService.register), que já vincula um User.
  async create(input: CreateDonorInput) {
    const created = await prisma.donor.create({ data: input })
    // Sem await: a resposta não espera o serviço de mapas (melhor esforço).
    if (touchesAddress(input)) void geocoder.geocodeStoredProfile('donor', created.id)
    return created
  }

  async findAll(filter: ListDonorsFilter, pagination: PaginationParams) {
    const where = {
      ...(filter.includeInactive ? {} : { active: true }),
      ...(filter.approval && { user: { is: { approvalStatus: filter.approval } } }),
      ...(filter.search && {
        name: { contains: filter.search, mode: 'insensitive' as const },
      }),
    }

    const [donors, total] = await Promise.all([
      prisma.donor.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit,
        orderBy: { name: 'asc' },
        include: { user: { select: { email: true, approvalStatus: true, approvalNote: true } } },
      }),
      prisma.donor.count({ where }),
    ])

    return paginate(donors, total, pagination)
  }

  async findById(id: string, requester: Requester) {
    const donor = await prisma.donor.findUnique({ where: { id } })
    if (!donor) {
      throw new NotFoundError('Doador')
    }

    this.assertAccess(donor, requester)
    return donor
  }

  async update(id: string, input: UpdateDonorInput, requester: Requester) {
    const donor = await this.findById(id, requester)
    // Endereço novo invalida as coordenadas antigas até a nova geocodificação.
    const addressChanged = touchesAddress(input)
    const updated = await prisma.donor.update({
      where: { id: donor.id },
      data: addressChanged ? { ...input, latitude: null, longitude: null } : input,
    })
    if (addressChanged) void geocoder.geocodeStoredProfile('donor', updated.id)
    return updated
  }

  async deactivate(id: string) {
    const donor = await prisma.donor.findUnique({ where: { id } })
    if (!donor) {
      throw new NotFoundError('Doador')
    }
    await prisma.donor.update({ where: { id }, data: { active: false } })
  }

  // ADMIN acessa qualquer doador; DOADOR só o próprio cadastro (vinculado
  // via userId, obtido do próprio login — nunca de um id passado no body).
  private assertAccess(donor: { userId: string | null }, requester: Requester) {
    if (requester.role === Role.ADMIN) return
    if (requester.role === Role.DOADOR && donor.userId === requester.id) return
    throw new ForbiddenError('Você só pode acessar seu próprio cadastro de doador.')
  }
}
