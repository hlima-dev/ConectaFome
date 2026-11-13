import { Router } from 'express'
import { Role } from '@prisma/client'
import { DonorController } from '../controllers/DonorController'
import { authenticate, authorize } from '../middlewares/auth'

const router = Router()
const controller = new DonorController()

router.use(authenticate)

router.get('/', authorize(Role.ADMIN), (req, res) => controller.list(req, res))
router.post('/', authorize(Role.ADMIN), (req, res) => controller.create(req, res))
// :id sem authorize aqui — ADMIN acessa qualquer doador, DOADOR só o
// próprio (checado dentro do DonorService, comparando com req.user).
router.get('/:id', (req, res) => controller.getById(req, res))
router.patch('/:id', (req, res) => controller.update(req, res))
router.patch('/:id/approval', authorize(Role.ADMIN), (req, res) => controller.setApproval(req, res))
router.delete('/:id', authorize(Role.ADMIN), (req, res) => controller.deactivate(req, res))

export { router as donorRouter }
