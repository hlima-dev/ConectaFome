import { Router } from 'express'
import { ReceiptVerificationService } from '../services/ReceiptVerificationService'
import { VolunteerApplicationController } from '../controllers/VolunteerApplicationController'
import { applyLimiter } from '../middlewares/rateLimiter'
import { successResponse } from '../utils/pagination'

// Rotas públicas (sem login), só de leitura e com resposta mínima.
const router = Router()
const receipts = new ReceiptVerificationService()
const applications = new VolunteerApplicationController()

router.get('/receipts/:code/:signature', async (req, res) => {
  res.json(successResponse(await receipts.verify(String(req.params.code), String(req.params.signature))))
})

// Inscrição de voluntário (formulário da página inicial).
router.post('/volunteers/apply', applyLimiter, (req, res) => applications.apply(req, res))

export { router as publicRouter }
