import crypto from 'crypto'
import jwt from 'jsonwebtoken'
import { AuthClaims } from './types'
import { UserRole, UserTier } from '@jani/shared'

const ACCESS_EXPIRATION = '15m'
const REFRESH_EXPIRATION_DAYS = 30

const getAccessSecret = () => {
  const secret = process.env.AUTH_JWT_SECRET
  if (!secret) {
    throw new Error('AUTH_JWT_SECRET is not configured')
  }
  return secret
}

const getRefreshSecret = () => {
  const secret = process.env.AUTH_REFRESH_SECRET
  if (!secret) {
    throw new Error('AUTH_REFRESH_SECRET is not configured')
  }
  return secret
}

const toClaims = (payload: jwt.JwtPayload): AuthClaims => {
  if (!payload.sub) throw new Error('TOKEN_SUB_MISSING')
  return {
    userId: String(payload.sub),
    roles: (payload.roles || []) as UserRole[],
    tier: (payload.tier as UserTier) || 'free',
    sessionId: String(payload.sid || payload.sessionId),
  }
}

export const signAccessToken = (data: { userId: string; roles: UserRole[]; tier: UserTier; sessionId: string }) => {
  const token = jwt.sign(
    {
      roles: data.roles,
      tier: data.tier,
      sid: data.sessionId,
      type: 'access',
    },
    getAccessSecret(),
    {
      subject: data.userId,
      expiresIn: ACCESS_EXPIRATION,
    }
  )
  return token
}

export const signRefreshToken = (data: { userId: string; roles: UserRole[]; tier: UserTier; sessionId: string }) => {
  const token = jwt.sign(
    {
      roles: data.roles,
      tier: data.tier,
      sid: data.sessionId,
      type: 'refresh',
    },
    getRefreshSecret(),
    {
      subject: data.userId,
      expiresIn: `${REFRESH_EXPIRATION_DAYS}d`,
    }
  )
  const expiresAt = new Date(Date.now() + REFRESH_EXPIRATION_DAYS * 24 * 60 * 60 * 1000)
  return { token, expiresAt }
}

export const verifyAccessToken = (token: string): AuthClaims => {
  const payload = jwt.verify(token, getAccessSecret()) as jwt.JwtPayload
  return toClaims(payload)
}

export const verifyRefreshToken = (token: string): AuthClaims => {
  const payload = jwt.verify(token, getRefreshSecret()) as jwt.JwtPayload
  return toClaims(payload)
}

export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex')
