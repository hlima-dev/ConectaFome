import { Router } from 'express'
import { Role } from '@prisma/client'
import { AuthController } from '../controllers/AuthController'
import { authenticate, authorize } from '../middlewares/auth'
import { authLimiter } from '../middlewares/rateLimiter'

const router = Router()
const controller = new AuthController()

router.post('/register', authLimiter, (req, res) => controller.register(req, res))
router.post('/login', authLimiter, (req, res) => controller.login(req, res))
router.post('/refresh', authLimiter, (req, res) => controller.refresh(req, res))

router.post('/forgot-password', authLimiter, (req, res) => controller.forgotPassword(req, res))
router.post('/reset-password', authLimiter, (req, res) => controller.resetPassword(req, res))
router.post('/users/:userId/reset-link', authenticate, authorize(Role.ADMIN), (req, res) => controller.adminResetLink(req, res))

router.post('/logout', authenticate, (req, res) => controller.logout(req, res))
router.get('/me', authenticate, (req, res) => controller.me(req, res))
router.patch('/me', authenticate, (req, res) => controller.updateProfile(req, res))
router.patch('/change-password', authenticate, (req, res) => controller.changePassword(req, res))

export { router as authRouter }
