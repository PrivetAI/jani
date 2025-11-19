import { Router } from 'express'
import { z } from 'zod'
import { AuthService } from '@jani/auth'

const router = Router()
const REFRESH_COOKIE_NAME = 'jid'

const authRequestSchema = z.object({
  initData: z.string().min(1),
})

const setRefreshCookie = (res: any, token: string) => {
  const isProd = process.env.NODE_ENV === 'production'
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/api/auth',
  })
}

router.post('/telegram', async (req, res) => {
  try {
    const { initData } = authRequestSchema.parse(req.body)
    const result = await AuthService.authenticateTelegram(initData, {
      channel: 'miniapp',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    })

    setRefreshCookie(res, result.refreshToken)
    res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } })
  } catch (error: any) {
    res.status(400).json({ success: false, error: { code: 'AUTH_ERROR', message: error.message || 'Ошибка авторизации' } })
  }
})

router.post('/refresh', async (req, res) => {
  const token = (req.cookies && req.cookies[REFRESH_COOKIE_NAME]) || req.body?.refreshToken
  if (!token) {
    return res.status(401).json({ success: false, error: { code: 'REFRESH_REQUIRED', message: 'Нет refresh токена' } })
  }

  try {
    const result = await AuthService.refreshSession(token, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    })
    setRefreshCookie(res, result.refreshToken)
    res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } })
  } catch (error: any) {
    res.status(401).json({ success: false, error: { code: 'REFRESH_FAILED', message: error.message || 'Обновление сессии не удалось' } })
  }
})

router.post('/logout', async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME]
  if (token) {
    await AuthService.revokeSession(token)
  }
  res.clearCookie(REFRESH_COOKIE_NAME)
  res.json({ success: true, data: { ok: true } })
})

export default router
