import { Request, Response } from 'express'
import { z } from 'zod'
import { ApprovalStatus } from '@prisma/client'
import { ApprovalService } from '../services/ApprovalService'
import { RecipientType } from '@prisma/client'
import { RecipientService } from '../services/RecipientService'
import { getPagination, successResponse } from '../utils/pagination'
import { optionalDocument, optionalEmail } from '../utils/validation'

const recipientService = new RecipientService()

const createRecipientSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  type: z.nativeEnum(RecipientType).optional(),
  document: optionalDocument,
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: optionalEmail,
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  peopleServed: z.coerce.number().int().positive().optional(),
})

const approvalSchema = z.object({
  status: z.nativeEnum(ApprovalStatus),
  note: z.string().max(300).optional(),
})
const approvalService = new ApprovalService()

const updateRecipientSchema = createRecipientSchema.partial()

export class RecipientController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createRecipientSchema.parse(req.body)
    const recipient = await recipientService.create(data)
    res.status(201).json(successResponse(recipient, 'Receptor cadastrado com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)
    const filter = {
      includeInactive: req.query.includeInactive === 'true',
      search: req.query.search as string | undefined,
      approval: req.query.approval && ['PENDENTE', 'APROVADO', 'REJEITADO'].includes(String(req.query.approval)) ? (String(req.query.approval) as ApprovalStatus) : undefined,
    }
    const result = await recipientService.findAll(filter, pagination)
    res.json(successResponse(result))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const recipient = await recipientService.findById(String(req.params.id), req.user!)
    res.json(successResponse(recipient))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = updateRecipientSchema.parse(req.body)
    const recipient = await recipientService.update(String(req.params.id), data, req.user!)
    res.json(successResponse(recipient, 'Receptor atualizado com sucesso'))
  }

  async setApproval(req: Request, res: Response): Promise<void> {
    const data = approvalSchema.parse(req.body)
    const result = await approvalService.setStatus('recipient', String(req.params.id), data.status, data.note)
    res.json(successResponse(result, 'Situação do cadastro atualizada'))
  }

  async deactivate(req: Request, res: Response): Promise<void> {
    await recipientService.deactivate(String(req.params.id))
    res.status(204).send()
  }
}
