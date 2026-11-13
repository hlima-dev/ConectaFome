import { Request, Response } from 'express'
import { z } from 'zod'
import { ApprovalStatus } from '@prisma/client'
import { ApprovalService } from '../services/ApprovalService'
import { DonorType } from '@prisma/client'
import { DonorService } from '../services/DonorService'
import { getPagination, successResponse } from '../utils/pagination'
import { optionalDocument, optionalEmail } from '../utils/validation'

const donorService = new DonorService()

const createDonorSchema = z.object({
  name: z.string().min(2, 'Nome deve ter ao menos 2 caracteres'),
  type: z.nativeEnum(DonorType).optional(),
  document: optionalDocument,
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: optionalEmail,
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
})

const approvalSchema = z.object({
  status: z.nativeEnum(ApprovalStatus),
  note: z.string().max(300).optional(),
})
const approvalService = new ApprovalService()

const updateDonorSchema = createDonorSchema.partial()

export class DonorController {
  async create(req: Request, res: Response): Promise<void> {
    const data = createDonorSchema.parse(req.body)
    const donor = await donorService.create(data)
    res.status(201).json(successResponse(donor, 'Doador cadastrado com sucesso'))
  }

  async list(req: Request, res: Response): Promise<void> {
    const pagination = getPagination(req)
    const filter = {
      includeInactive: req.query.includeInactive === 'true',
      search: req.query.search as string | undefined,
      approval: req.query.approval && ['PENDENTE', 'APROVADO', 'REJEITADO'].includes(String(req.query.approval)) ? (String(req.query.approval) as ApprovalStatus) : undefined,
    }
    const result = await donorService.findAll(filter, pagination)
    res.json(successResponse(result))
  }

  async getById(req: Request, res: Response): Promise<void> {
    const donor = await donorService.findById(String(req.params.id), req.user!)
    res.json(successResponse(donor))
  }

  async update(req: Request, res: Response): Promise<void> {
    const data = updateDonorSchema.parse(req.body)
    const donor = await donorService.update(String(req.params.id), data, req.user!)
    res.json(successResponse(donor, 'Doador atualizado com sucesso'))
  }

  async setApproval(req: Request, res: Response): Promise<void> {
    const data = approvalSchema.parse(req.body)
    const result = await approvalService.setStatus('donor', String(req.params.id), data.status, data.note)
    res.json(successResponse(result, 'Situação do cadastro atualizada'))
  }

  async deactivate(req: Request, res: Response): Promise<void> {
    await donorService.deactivate(String(req.params.id))
    res.status(204).send()
  }
}
