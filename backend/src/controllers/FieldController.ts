import { Request, Response } from 'express'
import { z } from 'zod'
import { PickupFailureReason } from '@prisma/client'
import { FieldService } from '../services/FieldService'
import { uploadedBuffers } from '../middlewares/upload'
import { successResponse } from '../utils/pagination'

const service = new FieldService()

const collectSchema = z.object({ quantityKg: z.coerce.number().positive().optional() })
const failSchema = z.object({
  reason: z.nativeEnum(PickupFailureReason),
  note: z.string().max(300).optional(),
})

// Campos de formulário vazios ("") chegam como string; tratamos como ausentes.
const clean = (body: unknown) =>
  Object.fromEntries(Object.entries((body as Record<string, unknown>) ?? {}).filter(([, v]) => v !== '' && v !== undefined))

export class FieldController {
  async view(req: Request, res: Response): Promise<void> {
    res.json(successResponse(await service.view(String(req.params.token))))
  }

  async start(req: Request, res: Response): Promise<void> {
    res.json(successResponse(await service.start(String(req.params.token)), 'Rota iniciada'))
  }

  async collect(req: Request, res: Response): Promise<void> {
    const { quantityKg } = collectSchema.parse(clean(req.body))
    const out = await service.collect(String(req.params.token), String(req.params.donationId), uploadedBuffers(req), quantityKg)
    res.json(successResponse(out, 'Coleta registrada'))
  }

  async fail(req: Request, res: Response): Promise<void> {
    const { reason, note } = failSchema.parse(clean(req.body))
    const out = await service.fail(String(req.params.token), String(req.params.donationId), reason, note, uploadedBuffers(req))
    res.json(successResponse(out, 'Parada registrada como não coletada'))
  }

  async finish(req: Request, res: Response): Promise<void> {
    res.json(successResponse(await service.finish(String(req.params.token)), 'Rota concluída'))
  }
}
