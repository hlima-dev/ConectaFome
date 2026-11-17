import { Router } from 'express'
import { Role } from '@prisma/client'
import { VolunteerApplicationController } from '../controllers/VolunteerApplicationController'
import { authenticate, authorize } from '../middlewares/auth'

// Análise das inscrições de voluntário: só a administração.
const router = Router()
const controller = new VolunteerApplicationController()

router.use(authenticate, authorize(Role.ADMIN))

router.get('/', (req, res) => controller.list(req, res))
router.patch('/:id/approve', (req, res) => controller.approve(req, res))
router.patch('/:id/reject', (req, res) => controller.reject(req, res))

export { router as volunteerApplicationRouter }
