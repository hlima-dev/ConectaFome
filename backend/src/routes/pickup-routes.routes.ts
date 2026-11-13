import { Router } from 'express'
import { Role } from '@prisma/client'
import { PickupRouteController } from '../controllers/PickupRouteController'
import { authenticate, authorize } from '../middlewares/auth'

const router = Router()
const controller = new PickupRouteController()

router.use(authenticate, authorize(Role.ADMIN))

router.get('/', (req, res) => controller.list(req, res))
router.post('/', (req, res) => controller.create(req, res))
router.get('/:id', (req, res) => controller.getById(req, res))
router.patch('/:id', (req, res) => controller.update(req, res))
router.post('/:id/donations', (req, res) => controller.attachDonation(req, res))
router.delete('/:id/donations/:donationId', (req, res) => controller.detachDonation(req, res))
router.post('/:id/field-link', (req, res) => controller.createFieldLink(req, res))
router.delete('/:id/field-link', (req, res) => controller.revokeFieldLinks(req, res))
router.patch('/:id/start', (req, res) => controller.start(req, res))
router.patch('/:id/stops/:donationId/collect', (req, res) => controller.collectStop(req, res))
router.patch('/:id/stops/:donationId/fail', (req, res) => controller.failStop(req, res))
router.patch('/:id/complete', (req, res) => controller.complete(req, res))
router.patch('/:id/cancel', (req, res) => controller.cancel(req, res))

export { router as pickupRouteRouter }
