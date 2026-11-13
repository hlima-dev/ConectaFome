import { Request, Response } from 'express'
import { z } from 'zod'
import { ReportService } from '../services/ReportService'
import { successResponse } from '../utils/pagination'

const reportService = new ReportService()

const yearQuerySchema = z.object({
  year: z.coerce.number().int().optional(),
})

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a data no formato AAAA-MM-DD').refine((v) => !Number.isNaN(Date.parse(v)), 'Data inválida')

const periodQuerySchema = z
  .object({ from: isoDate.optional(), to: isoDate.optional() })
  .refine((p) => !p.from || !p.to || p.from <= p.to, { message: 'A data inicial não pode ser depois da final', path: ['from'] })

const monthlyKgQuerySchema = yearQuerySchema.extend({
  donorId: z.string().optional(),
  recipientId: z.string().optional(),
})

export class ReportController {
  async monthlyKg(req: Request, res: Response): Promise<void> {
    const filter = monthlyKgQuerySchema.parse(req.query)
    const result = await reportService.monthlyKg(filter)
    res.json(successResponse(result))
  }

  async byDonor(req: Request, res: Response): Promise<void> {
    const filter = yearQuerySchema.parse(req.query)
    const result = await reportService.byDonor(filter)
    res.json(successResponse(result))
  }

  async byRecipient(req: Request, res: Response): Promise<void> {
    const filter = yearQuerySchema.parse(req.query)
    const result = await reportService.byRecipient(filter)
    res.json(successResponse(result))
  }

  async rates(req: Request, res: Response): Promise<void> {
    const period = periodQuerySchema.parse(req.query)
    res.json(successResponse(await reportService.rates(period)))
  }

  async donationsCsv(req: Request, res: Response): Promise<void> {
    const period = periodQuerySchema.parse(req.query)
    const csv = await reportService.donationsCsv(period)
    const today = new Date().toISOString().slice(0, 10)
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="doacoes-${today}.csv"`)
    res.send(csv)
  }

  async summary(_req: Request, res: Response): Promise<void> {
    const result = await reportService.summary()
    res.json(successResponse(result))
  }

  async pending(_req: Request, res: Response): Promise<void> {
    res.json(successResponse(await reportService.pending()))
  }
}
