import { Router } from 'express'
import { photoPolicy } from '../storage/StorageDriver'
import { successResponse } from '../utils/pagination'

// Configuração pública que o front precisa saber para montar as telas (sem segredos).
const router = Router()

router.get('/', (_req, res) => {
  const photos = photoPolicy()
  res.json(successResponse({ photos }))
})

export { router as configRouter }
