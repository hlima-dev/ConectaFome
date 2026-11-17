import { Request, Response } from 'express'
import { z } from 'zod'
import { ApplicationStatus } from '@prisma/client'
import { AVAILABILITY, VolunteerApplicationService } from '../services/VolunteerApplicationService'
import { getPagination, successResponse } from '../utils/pagination'
import { onlyDigits } from '../utils/document'
import { optionalEmail } from '../utils/validation'

const service = new VolunteerApplicationService()

const applySchema = z.object({
  name: z.string().trim().min(2, 'Informe o seu nome').max(100),
  phone: z
    .string({ error: 'Informe o seu WhatsApp' })
    .transform(onlyDigits)
    .refine((digits) => digits.length === 10 || digits.length === 11, 'Informe o telefone com DDD'),
  email: optionalEmail,
  city: z.string().trim().min(2, 'Informe a sua cidade').max(80),
  availability: z.array(z.enum(AVAILABILITY)).min(1, 'Escolha ao menos um horário').max(AVAILABILITY.length),
  hasVehicle: z.boolean().default(false),
  message: z.preprocess((v) => (v === '' ? undefined : v), z.string().trim().max(500).optional()),
  consent: z.literal(true, { error: 'É preciso concordar em ser contatado' }),
  // Isca para robôs: campo escondido na tela. Pessoa de verdade nunca o preenche.
  website: z.string().optional(),
})

const approveSchema = z.object({ document: z.string().min(1, 'Informe o CPF do voluntário') })
const rejectSchema = z.object({ note: z.string().max(300).optional() })

export class VolunteerApplicationController {
  async apply(req: Request, res: Response): Promise<void> {
    const { website, consent: _consent, ...data } = applySchema.parse(req.body)
    // Robô: finge sucesso e não grava nada (assim ele não aprende o que o barrou).
    if (website) {
      res.status(201).json(successResponse(null, 'Inscrição recebida'))
      return
    }
    await service.submit(data)
    res.status(201).json(successResponse(null, 'Inscrição recebida! A equipe entra em contato pelo WhatsApp.'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const raw = String(req.query.status ?? '')
    const status = (Object.values(ApplicationStatus) as string[]).includes(raw) ? (raw as ApplicationStatus) : undefined
    res.json(successResponse(await service.list({ status }, getPagination(req))))
  }

  async approve(req: Request, res: Response): Promise<void> {
    const { document } = approveSchema.parse(req.body)
    const volunteer = await service.approve(String(req.params.id), { document })
    res.json(successResponse(volunteer, 'Inscrição aprovada e voluntário cadastrado'))
  }

  async reject(req: Request, res: Response): Promise<void> {
    const { note } = rejectSchema.parse(req.body ?? {})
    await service.reject(String(req.params.id), { note })
    res.json(successResponse(null, 'Inscrição recusada'))
  }
}
