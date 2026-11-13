import { Request, Response } from 'express'
import { z } from 'zod'
import { DonationStatus, FoodCategory, StorageCondition } from '@prisma/client'
import { DonationService } from '../services/DonationService'
import { PhotoService } from '../services/PhotoService'
import { uploadedBuffers } from '../middlewares/upload'
import { getPagination, successResponse } from '../utils/pagination'
import { optionalDate } from '../utils/validation'

const donationService = new DonationService()
const photoService = new PhotoService()

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data no formato AAAA-MM-DD').refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida')

// Filtros extras da lista (busca, período, ordem). Vazio vale como ausente.
const listExtraSchema = z.object({
  q: z.preprocess((v) => (v === '' ? undefined : v), z.string().max(80).optional()),
  from: z.preprocess((v) => (v === '' ? undefined : v), isoDay.optional()),
  to: z.preprocess((v) => (v === '' ? undefined : v), isoDay.optional()),
  sort: z.preprocess((v) => (v === '' ? undefined : v), z.enum(['recentes', 'prazo']).optional()),
})

const photoKindSchema = z.object({ kind: z.enum(['OFERTA', 'ENTREGA']).default('OFERTA') })

const createDonationSchema = z.object({
  donorId: z.string().optional(),
  category: z.nativeEnum(FoodCategory).optional(),
  description: z.string().min(3, 'Descrição deve ter ao menos 3 caracteres'),
  estimatedQuantityKg: z.coerce.number().positive('Quantidade deve ser maior que zero'),
  bestBeforeDate: optionalDate,
  pickupWindowStart: z.coerce.date(),
  pickupWindowEnd: z.coerce.date(),
  storageCondition: z.nativeEnum(StorageCondition).optional(),
  acceptTerms: z.literal(true, { message: 'É necessário declarar que o alimento está próprio para consumo' }),
  notes: z.string().optional(),
})

const updateDonationSchema = createDonationSchema.omit({ donorId: true, acceptTerms: true }).partial()

const matchSchema = z.object({
  recipientId: z.string().min(1, 'Informe o receptor'),
})

export class DonationController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createDonationSchema.parse(req.body)
    const donation = await donationService.create(data, req.user!)
    res.status(201).json(successResponse(donation, 'Doação cadastrada com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)
    const filter = {
      status: req.query.status as DonationStatus | undefined,
      donorId: req.query.donorId as string | undefined,
      recipientId: req.query.recipientId as string | undefined,
      category: req.query.category as FoodCategory | undefined,
      ...listExtraSchema.parse(req.query),
    }
    const result = await donationService.findAll(filter, pagination, req.user!)
    res.json(successResponse(result))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const donation = await donationService.findById(String(req.params.id), req.user!)
    res.json(successResponse(donation))
  }

  async opportunities(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)
    const filter = {
      city: typeof req.query.city === 'string' && req.query.city.trim() ? req.query.city.trim() : undefined,
      category: req.query.category as FoodCategory | undefined,
    }
    const result = await donationService.opportunities(filter, pagination, req.user!)
    res.json(successResponse(result))
  }

  async reserve(req: Request, res: Response): Promise<void> {
    const donation = await donationService.reserve(String(req.params.id), req.user!)
    res.json(successResponse(donation, 'Doação reservada para você'))
  }

  async release(req: Request, res: Response): Promise<void> {
    const donation = await donationService.release(String(req.params.id), req.user!)
    res.json(successResponse(donation, 'Reserva desfeita — a doação voltou a ficar disponível'))
  }

  async receipt(req: Request, res: Response): Promise<void> {
    const receipt = await donationService.getReceipt(String(req.params.id), req.user!)
    res.json(successResponse(receipt))
  }

  async events(req: Request, res: Response): Promise<void> {
    const events = await donationService.findEvents(String(req.params.id), req.user!)
    res.json(successResponse(events))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = updateDonationSchema.parse(req.body)
    const donation = await donationService.update(String(req.params.id), data, req.user!)
    res.json(successResponse(donation, 'Doação atualizada com sucesso'))
  }

  async match(req: Request, res: Response): Promise<void> {
    const { recipientId } = matchSchema.parse(req.body)
    const donation = await donationService.match(String(req.params.id), recipientId, req.user!)
    res.json(successResponse(donation, 'Doação casada com o receptor'))
  }

  async cancel(req: Request, res: Response): Promise<void> {
    const donation = await donationService.cancel(String(req.params.id), req.user!)
    res.json(successResponse(donation, 'Doação cancelada'))
  }

  async markExpired(req: Request, res: Response): Promise<void> {
    const donation = await donationService.markExpired(String(req.params.id), req.user!)
    res.json(successResponse(donation, 'Doação marcada como vencida'))
  }

  async confirmReceipt(req: Request, res: Response): Promise<void> {
    const donation = await donationService.confirmReceipt(String(req.params.id), req.user!)
    res.json(successResponse(donation, 'Recebimento confirmado'))
  }

  async photos(req: Request, res: Response): Promise<void> {
    res.json(successResponse(await photoService.list(String(req.params.id), req.user!)))
  }

  async uploadPhotos(req: Request, res: Response): Promise<void> {
    const { kind } = photoKindSchema.parse(req.body ?? {})
    const created = await photoService.uploadAs(String(req.params.id), kind, uploadedBuffers(req), req.user!)
    res.status(201).json(successResponse(created, 'Foto enviada'))
  }

  async photoFile(req: Request, res: Response): Promise<void> {
    const file = await photoService.getFile(String(req.params.id), String(req.params.photoId), req.user!)
    res.set({
      'Content-Type': file.contentType,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      // O padrão do helmet (same-origin) bloquearia o <img> quando o site e a API estão em origens diferentes.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    })
    res.send(file.data)
  }
}
