import { Request, Response } from 'express'
import { z } from 'zod'
import { PickupFailureReason, PickupRouteStatus } from '@prisma/client'
import { PickupRouteService } from '../services/PickupRouteService'
import { FieldService } from '../services/FieldService'
import { getPagination, successResponse } from '../utils/pagination'

const pickupRouteService = new PickupRouteService()
const fieldService = new FieldService()

const createRouteSchema = z.object({
  vehicleId: z.string().min(1, 'Selecione o veículo'),
  volunteerId: z.string().min(1, 'Selecione o voluntário'),
  scheduledFor: z.coerce.date(),
  notes: z.string().optional(),
})

const updateRouteSchema = createRouteSchema.partial()

const attachDonationSchema = z.object({
  donationId: z.string().min(1, 'Informe a doação'),
})

const collectStopSchema = z.object({ quantityKg: z.coerce.number().positive().optional() })
const failStopSchema = z.object({
  reason: z.nativeEnum(PickupFailureReason),
  note: z.string().max(300).optional(),
})

const completeRouteSchema = z.object({
  collectedQuantities: z
    .array(
      z.object({
        donationId: z.string().min(1),
        collectedQuantityKg: z.coerce.number().positive(),
      }),
    )
    // Teto defensivo: uma rota real tem poucas doações (e listas enormes são o
    // vetor do aviso de memória do zod).
    .max(200)
    .optional(),
})

export class PickupRouteController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createRouteSchema.parse(req.body)
    const route = await pickupRouteService.create(data)
    res.status(201).json(successResponse(route, 'Rota de coleta criada com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)
    const filter = {
      status: req.query.status as PickupRouteStatus | undefined,
      vehicleId: req.query.vehicleId as string | undefined,
      volunteerId: req.query.volunteerId as string | undefined,
    }
    const result = await pickupRouteService.findAll(filter, pagination)
    res.json(successResponse(result))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const route = await pickupRouteService.findById(String(req.params.id))
    res.json(successResponse(route))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = updateRouteSchema.parse(req.body)
    const route = await pickupRouteService.update(String(req.params.id), data)
    res.json(successResponse(route, 'Rota atualizada com sucesso'))
  }

  async attachDonation(req: Request, res: Response): Promise<void> {
    const { donationId } = attachDonationSchema.parse(req.body)
    const route = await pickupRouteService.attachDonation(String(req.params.id), donationId, req.user!.id)
    res.json(successResponse(route, 'Doação anexada à rota'))
  }

  async detachDonation(req: Request, res: Response): Promise<void> {
    const route = await pickupRouteService.detachDonation(String(req.params.id), String(req.params.donationId), req.user!.id)
    res.json(successResponse(route, 'Doação removida da rota'))
  }

  async start(req: Request, res: Response): Promise<void> {
    const route = await pickupRouteService.start(String(req.params.id))
    res.json(successResponse(route, 'Rota iniciada'))
  }

  async complete(req: Request, res: Response): Promise<void> {
    const { collectedQuantities } = completeRouteSchema.parse(req.body ?? {})
    const route = await pickupRouteService.complete(String(req.params.id), collectedQuantities, req.user!.id)
    res.json(successResponse(route, 'Rota concluída — doações marcadas como coletadas'))
  }

  async cancel(req: Request, res: Response): Promise<void> {
    const route = await pickupRouteService.cancel(String(req.params.id), req.user!.id)
    res.json(successResponse(route, 'Rota cancelada'))
  }

  async collectStop(req: Request, res: Response): Promise<void> {
    const data = collectStopSchema.parse(req.body ?? {})
    const route = await pickupRouteService.collectStop(String(req.params.id), String(req.params.donationId), data, { userId: req.user!.id })
    res.json(successResponse(route, 'Parada coletada'))
  }

  async failStop(req: Request, res: Response): Promise<void> {
    const data = failStopSchema.parse(req.body ?? {})
    const route = await pickupRouteService.failStop(String(req.params.id), String(req.params.donationId), data, { userId: req.user!.id })
    res.json(successResponse(route, 'Parada registrada como não coletada'))
  }

  async createFieldLink(req: Request, res: Response): Promise<void> {
    const result = await fieldService.createLink(String(req.params.id))
    res.json(successResponse(result, 'Link gerado. Os links anteriores desta rota deixaram de valer.'))
  }

  async revokeFieldLinks(req: Request, res: Response): Promise<void> {
    await fieldService.revokeLinks(String(req.params.id))
    res.status(204).send()
  }
}
