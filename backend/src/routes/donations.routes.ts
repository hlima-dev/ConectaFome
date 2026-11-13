import { Router } from 'express'
import { Role } from '@prisma/client'
import { DonationController } from '../controllers/DonationController'
import { authenticate, authorize } from '../middlewares/auth'
import { photoUpload } from '../middlewares/upload'

const router = Router()
const controller = new DonationController()

router.use(authenticate)

// list/getById sem authorize no nível de rota — o escopo por papel
// (ADMIN vê tudo, DOADOR só as próprias, RECEPTOR só as suas) é aplicado
// dentro do DonationService.
router.get('/', (req, res) => controller.list(req, res))
// Antes de '/:id' para não ser capturada como um id.
router.get('/opportunities', authorize(Role.ADMIN, Role.RECEPTOR), (req, res) => controller.opportunities(req, res))
router.post('/', authorize(Role.ADMIN, Role.DOADOR), (req, res) => controller.create(req, res))
router.get('/:id', (req, res) => controller.getById(req, res))
router.get('/:id/events', (req, res) => controller.events(req, res))
router.get('/:id/photos', (req, res) => controller.photos(req, res))
router.post('/:id/photos', authorize(Role.ADMIN, Role.DOADOR, Role.RECEPTOR), photoUpload('photos', 3), (req, res) => controller.uploadPhotos(req, res))
router.get('/:id/photos/:photoId/file', (req, res) => controller.photoFile(req, res))
router.get('/:id/receipt', authorize(Role.ADMIN, Role.DOADOR), (req, res) => controller.receipt(req, res))
router.patch('/:id', authorize(Role.ADMIN, Role.DOADOR), (req, res) => controller.update(req, res))
router.patch('/:id/match', authorize(Role.ADMIN), (req, res) => controller.match(req, res))
router.patch('/:id/reserve', authorize(Role.RECEPTOR), (req, res) => controller.reserve(req, res))
router.patch('/:id/release', authorize(Role.ADMIN, Role.RECEPTOR), (req, res) => controller.release(req, res))
router.patch('/:id/cancel', authorize(Role.ADMIN, Role.DOADOR), (req, res) => controller.cancel(req, res))
router.patch('/:id/mark-expired', authorize(Role.ADMIN, Role.DOADOR), (req, res) => controller.markExpired(req, res))
router.patch('/:id/confirm-receipt', authorize(Role.ADMIN, Role.RECEPTOR), (req, res) =>
  controller.confirmReceipt(req, res),
)

export { router as donationRouter }
