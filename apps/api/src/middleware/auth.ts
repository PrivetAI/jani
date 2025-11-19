import type { NextFunction, Request, Response } from 'express'
import { AuthService } from '@jani/auth'
import { UserRole } from '@jani/shared'

const formatError = (message: string) => ({ success: false, error: { code: 'UNAUTHORIZED', message } })

const extractToken = (req: Request) => {
  const header = req.headers.authorization
  if (header && header.startsWith('Bearer ')) {
    return header.slice(7)
  }
  return undefined
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = extractToken(req)
  if (!token) {
    return res.status(401).json(formatError('Требуется авторизация'))
  }

  try {
    const claims = AuthService.verifyToken(token)
    req.auth = claims
    next()
  } catch (error) {
    return res.status(401).json(formatError('Сессия недействительна'))
  }
}

export const requireRole = (role: UserRole) => (req: Request, res: Response, next: NextFunction) => {
  const userRoles = req.auth?.roles ?? []
  if (!userRoles.includes(role)) {
    return res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Недостаточно прав' } })
  }
  next()
}
