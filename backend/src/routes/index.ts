import { Router } from 'express'

import { authRouter } from './auth.routes'
import { donorRouter } from './donors.routes'
import { recipientRouter } from './recipients.routes'
import { donationRouter } from './donations.routes'
import { volunteerRouter } from './volunteers.routes'
import { vehicleRouter } from './vehicles.routes'
import { pickupRouteRouter } from './pickup-routes.routes'
import { reportRouter } from './reports.routes'
import { notificationRouter } from './notifications.routes'
import { maintenanceRouter } from './maintenance.routes'
import { fieldRouter } from './field.routes'
import { publicRouter } from './public.routes'
import { configRouter } from './config.routes'

const router = Router()

router.use('/auth', authRouter)
router.use('/donors', donorRouter)
router.use('/recipients', recipientRouter)
router.use('/donations', donationRouter)
router.use('/volunteers', volunteerRouter)
router.use('/vehicles', vehicleRouter)
router.use('/pickup-routes', pickupRouteRouter)
router.use('/reports', reportRouter)
router.use('/notifications', notificationRouter)
router.use('/maintenance', maintenanceRouter)
router.use('/field', fieldRouter)
router.use('/public', publicRouter)
router.use('/config', configRouter)

export { router }
