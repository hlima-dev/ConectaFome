import { Router } from 'express'
import { ReceiptVerificationService } from '../services/ReceiptVerificationService'
import { successResponse } from '../utils/pagination'

// Rotas públicas (sem login), só de leitura e com resposta mínima.
const router = Router()
const receipts = new ReceiptVerificationService()

router.get('/receipts/:code/:signature', async (req, res) => {
  res.json(successResponse(await receipts.verify(String(req.params.code), String(req.params.signature))))
})

export { router as publicRouter }
