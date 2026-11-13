import { Router } from 'express'
import { FieldController } from '../controllers/FieldController'
import { fieldLimiter } from '../middlewares/rateLimiter'
import { photoUpload } from '../middlewares/upload'

// Rotas SEM login: quem autoriza é o link (token) da rota. Ficam fora do
// CSRF porque não usam cookie de sessão.
const router = Router()
const controller = new FieldController()

router.use(fieldLimiter)

router.get('/:token', (req, res) => controller.view(req, res))
router.post('/:token/start', (req, res) => controller.start(req, res))
router.post('/:token/stops/:donationId/collect', photoUpload('photos', 5), (req, res) => controller.collect(req, res))
router.post('/:token/stops/:donationId/fail', photoUpload('photos', 5), (req, res) => controller.fail(req, res))
router.post('/:token/finish', (req, res) => controller.finish(req, res))

export { router as fieldRouter }
