import { Router } from 'express'
import { AuthService } from '@jani/auth'
import { requireAuth } from '../middleware/auth'
import { getLimitStatus } from '../services/quota'

const router = Router()

router.get('/me', requireAuth, async (req, res) => {
  try {
    const profile = await AuthService.getProfile(req.auth!.userId)
    res.json({ success: true, data: { user: profile } })
  } catch (error: any) {
    res.status(404).json({ success: false, error: { code: 'USER_NOT_FOUND', message: error.message || 'Пользователь не найден' } })
  }
})

router.get('/limits', requireAuth, async (req, res) => {
  try {
    const limits = await getLimitStatus(req.auth!.userId)
    res.json({ success: true, data: { limits } })
  } catch (error: any) {
    res.status(400).json({ success: false, error: { code: 'LIMIT_ERROR', message: error.message || 'Не удалось получить лимиты' } })
  }
})

export default router
