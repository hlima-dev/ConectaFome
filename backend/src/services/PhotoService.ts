import { randomUUID } from 'node:crypto'
import { DonationStatus, PhotoKind, Role } from '@prisma/client'
import { prisma } from '../config/prisma'
import { ForbiddenError, NotFoundError, ValidationError } from '../utils/AppError'
import { processImage } from '../utils/image'
import { getStorage } from '../storage/StorageDriver'
import { assertApproved } from './ApprovalService'

export const MAX_PHOTOS: Record<PhotoKind, number> = { OFERTA: 3, COLETA: 5, ENTREGA: 3 }

interface Requester {
  id: string
  role: Role
}

interface AddPhotosInput {
  donationId: string
  kind: PhotoKind
  files: Buffer[]
  uploadedById?: string
  uploadedByLabel?: string
}

type DonationRef = { id: string; donorId: string; recipientId: string | null; status: DonationStatus }

const OFFER_UPLOAD_STATUSES: DonationStatus[] = [DonationStatus.DISPONIVEL, DonationStatus.RESERVADA, DonationStatus.AGENDADA]
const DELIVERY_UPLOAD_STATUSES: DonationStatus[] = [DonationStatus.COLETADA, DonationStatus.ENTREGUE]

export class PhotoService {
  // Grava as fotos já tratadas (reencodadas, sem EXIF). Tudo ou nada: se alguma
  // falha, o que já foi guardado é apagado e nada fica registrado.
  async addPhotos(input: AddPhotosInput) {
    if (input.files.length === 0) throw new ValidationError('Envie ao menos uma foto')

    const existing = await prisma.donationPhoto.count({ where: { donationId: input.donationId, kind: input.kind } })
    const limit = MAX_PHOTOS[input.kind]
    if (existing + input.files.length > limit) {
      throw new ValidationError(`No máximo ${limit} fotos por etapa. Esta doação já tem ${existing}.`)
    }

    // Trata todas antes de gravar qualquer uma: imagem inválida aborta cedo.
    const processed = await Promise.all(input.files.map((file) => processImage(file)))

    const storage = getStorage()
    const stored: { key: string; image: (typeof processed)[number] }[] = []
    try {
      for (const image of processed) {
        const key = `donations/${input.donationId}/${input.kind.toLowerCase()}-${randomUUID()}.webp`
        await storage.put(key, image.data, image.mimeType)
        stored.push({ key, image })
      }
      return await prisma.$transaction(
        stored.map(({ key, image }) =>
          prisma.donationPhoto.create({
            data: {
              donationId: input.donationId,
              kind: input.kind,
              storageKey: key,
              mimeType: image.mimeType,
              sizeBytes: image.data.length,
              width: image.width,
              height: image.height,
              uploadedById: input.uploadedById ?? null,
              uploadedByLabel: input.uploadedByLabel ?? null,
            },
            select: this.publicSelect,
          }),
        ),
      )
    } catch (error) {
      await Promise.allSettled(stored.map(({ key }) => storage.remove(key)))
      throw error
    }
  }

  private publicSelect = { id: true, kind: true, createdAt: true, uploadedByLabel: true, uploadedById: true, width: true, height: true } as const

  // Quem pode ver cada tipo de foto.
  // - administração: tudo
  // - doador dono: tudo da própria doação
  // - receptor dono (a doação foi reservada para ele): tudo
  // - qualquer receptor: só a foto da OFERTA enquanto a doação está disponível
  //   (precisa ver o alimento antes de reservar)
  private async canView(donation: DonationRef, kind: PhotoKind, requester: Requester): Promise<boolean> {
    if (requester.role === Role.ADMIN) return true
    if (requester.role === Role.DOADOR) {
      const donor = await prisma.donor.findUnique({ where: { userId: requester.id } })
      return !!donor && donor.id === donation.donorId
    }
    const recipient = await prisma.recipient.findUnique({ where: { userId: requester.id } })
    if (!recipient) return false
    if (donation.recipientId === recipient.id) return true
    return kind === PhotoKind.OFERTA && donation.status === DonationStatus.DISPONIVEL
  }

  async list(donationId: string, requester: Requester) {
    const donation = await this.getDonation(donationId)
    const photos = await prisma.donationPhoto.findMany({
      where: { donationId },
      orderBy: { createdAt: 'asc' },
      select: this.publicSelect,
    })
    const visible: typeof photos = []
    for (const photo of photos) {
      if (await this.canView(donation, photo.kind, requester)) visible.push(photo)
    }
    return visible
  }

  async getFile(donationId: string, photoId: string, requester: Requester) {
    const donation = await this.getDonation(donationId)
    const photo = await prisma.donationPhoto.findFirst({ where: { id: photoId, donationId } })
    // Mesma resposta para "não existe" e "não pode ver": não revela que a foto existe.
    if (!photo || !(await this.canView(donation, photo.kind, requester))) throw new NotFoundError('Foto')
    return getStorage().get(photo.storageKey)
  }

  // Envio por usuário logado: OFERTA (doador dono ou administração) e ENTREGA
  // (receptor dono ou administração). A foto da COLETA só entra pela rota.
  async uploadAs(donationId: string, kind: PhotoKind, files: Buffer[], requester: Requester) {
    const donation = await this.getDonation(donationId)

    if (kind === PhotoKind.COLETA) {
      throw new ForbiddenError('A foto da coleta é enviada pelo voluntário, na parada da rota')
    }

    if (kind === PhotoKind.OFERTA) {
      if (requester.role === Role.DOADOR) {
        await assertApproved(requester.id)
        const donor = await prisma.donor.findUnique({ where: { userId: requester.id } })
        if (!donor || donor.id !== donation.donorId) throw new ForbiddenError('Você só pode enviar fotos das próprias doações')
      } else if (requester.role !== Role.ADMIN) {
        throw new ForbiddenError('Apenas o doador ou a administração enviam a foto da oferta')
      }
      if (!OFFER_UPLOAD_STATUSES.includes(donation.status)) {
        throw new ValidationError('A foto da oferta só pode ser enviada antes da coleta')
      }
    }

    if (kind === PhotoKind.ENTREGA) {
      if (requester.role === Role.RECEPTOR) {
        const recipient = await prisma.recipient.findUnique({ where: { userId: requester.id } })
        if (!recipient || recipient.id !== donation.recipientId) throw new ForbiddenError('Você só pode enviar fotos das doações recebidas por você')
      } else if (requester.role !== Role.ADMIN) {
        throw new ForbiddenError('Apenas o receptor ou a administração enviam a foto da entrega')
      }
      if (!DELIVERY_UPLOAD_STATUSES.includes(donation.status)) {
        throw new ValidationError('A foto da entrega só pode ser enviada depois da coleta')
      }
    }

    return this.addPhotos({ donationId, kind, files, uploadedById: requester.id })
  }

  async countOffer(donationId: string): Promise<number> {
    return prisma.donationPhoto.count({ where: { donationId, kind: PhotoKind.OFERTA } })
  }

  private async getDonation(id: string): Promise<DonationRef> {
    const donation = await prisma.donation.findUnique({
      where: { id },
      select: { id: true, donorId: true, recipientId: true, status: true },
    })
    if (!donation) throw new NotFoundError('Doação')
    return donation
  }
}
