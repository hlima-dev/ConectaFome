import { Router } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { Role } from '@prisma/client'
import { env } from '../config/env'
import { authenticate, authorize } from '../middlewares/auth'
import { MaintenanceService } from '../services/MaintenanceService'
import { ForbiddenError, NotFoundError } from '../utils/AppError'
import { successResponse } from '../utils/pagination'

const router = Router()
const service = new MaintenanceService()

function secretMatches(provided: string | undefined, expected: string): boolean {
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Chamada pelo agendador externo (GitHub Actions). Sem CRON_SECRET configurado
// a rota nem existe (404); com ele, exige o cabeçalho X-Cron-Secret.
router.post('/run', async (req, res) => {
  if (!env.CRON_SECRET) throw new NotFoundError('Rota')
  if (!secretMatches(req.headers['x-cron-secret'] as string | undefined, env.CRON_SECRET)) {
    throw new ForbiddenError('Segredo inválido')
  }
  res.json(successResponse(await service.run(), 'Manutenção executada'))
})

// Botão "Executar verificação agora" do administrador.
router.post('/run-now', authenticate, authorize(Role.ADMIN), async (_req, res) => {
  res.json(successResponse(await service.run(), 'Manutenção executada'))
})

export { router as maintenanceRouter }
