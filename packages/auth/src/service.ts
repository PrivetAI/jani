import { randomUUID } from 'crypto'
import { prisma, SessionType } from '@jani/database'
import { PublicUserProfile, UserRole, UserTier } from '@jani/shared'
import { verifyTelegramInitData } from './telegram'
import { hashToken, signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from './tokens'
import { AuthClaims, AuthSessionMeta, LoginResult } from './types'
import { mapUserToProfile } from './profile'

const ALLOW_UNSAFE_INIT = process.env.AUTH_ALLOW_DEV_INIT_DATA === 'true'

const getTelegramSecret = () =>
  process.env.TELEGRAM_WEBAPP_SECRET || process.env.TELEGRAM_BOT_TOKEN || ''

const fetchProfile = async (userId: string): Promise<PublicUserProfile> => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { entitlements: true },
  })
  if (!user) {
    throw new Error('USER_NOT_FOUND')
  }
  const entitlements = user.entitlements.map((entitlement) => entitlement.slug)
  return mapUserToProfile(user, entitlements)
}

const ensureUserLimit = async (userId: string) => {
  await prisma.userLimit.upsert({
    where: {
      userId_channel: {
        userId,
        channel: 'default',
      },
    },
    update: {},
    create: {
      userId,
      channel: 'default',
      dailyLimit: 50,
      softCap: 2000,
    },
  })
}

const resolveSessionType = (channel?: AuthSessionMeta['channel']): SessionType => {
  if (channel === 'bot') return 'bot'
  if (channel === 'admin') return 'admin'
  return 'miniapp'
}

const persistSession = async (
  userId: string,
  roles: UserRole[],
  tier: UserTier,
  meta: AuthSessionMeta,
  sessionId?: string
) => {
  const sid = sessionId ?? randomUUID()
  const accessToken = signAccessToken({ userId, roles, tier, sessionId: sid })
  const { token: refreshToken, expiresAt } = signRefreshToken({ userId, roles, tier, sessionId: sid })
  const hashed = hashToken(refreshToken)

  if (sessionId) {
    await prisma.userSession.update({
      where: { id: sid },
      data: {
        refreshTokenHash: hashed,
        expiresAt,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
      },
    })
  } else {
    await prisma.userSession.create({
      data: {
        id: sid,
        userId,
        type: resolveSessionType(meta.channel),
        refreshTokenHash: hashed,
        ipAddress: meta.ipAddress,
        userAgent: meta.userAgent,
        expiresAt,
      },
    })
  }

  return { accessToken, refreshToken }
}

export const authenticateTelegram = async (initData: string, meta: AuthSessionMeta = {}): Promise<LoginResult> => {
  const secret = getTelegramSecret()
  const { user: tgUser } = verifyTelegramInitData(initData, secret, 60, ALLOW_UNSAFE_INIT)
  const telegramId = BigInt(tgUser.id)
  const userRecord = await prisma.user.upsert({
    where: { telegramId },
    update: {
      username: tgUser.username,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name,
      locale: tgUser.language_code,
      lastActiveAt: new Date(),
    },
    create: {
      telegramId,
      username: tgUser.username,
      firstName: tgUser.first_name,
      lastName: tgUser.last_name,
      locale: tgUser.language_code,
      tier: 'free',
      roles: ['user'],
    },
  })

  await ensureUserLimit(userRecord.id)
  const entitlements = await prisma.userEntitlement.findMany({ where: { userId: userRecord.id } })
  const profile = mapUserToProfile(userRecord, entitlements.map((e) => e.slug))
  const tokens = await persistSession(profile.id, profile.roles, profile.tier, meta)

  return { user: profile, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
}

export const refreshSession = async (refreshToken: string, meta: AuthSessionMeta = {}): Promise<LoginResult> => {
  const claims = verifyRefreshToken(refreshToken)
  const session = await prisma.userSession.findUnique({ where: { id: claims.sessionId } })
  if (!session || session.userId !== claims.userId) {
    throw new Error('SESSION_NOT_FOUND')
  }
  if (session.revokedAt || session.expiresAt < new Date()) {
    throw new Error('SESSION_REVOKED')
  }

  const hashed = hashToken(refreshToken)
  if (session.refreshTokenHash !== hashed) {
    throw new Error('SESSION_TOKEN_MISMATCH')
  }

  const profile = await fetchProfile(claims.userId)
  const tokens = await persistSession(profile.id, profile.roles, profile.tier, meta, session.id)
  return { user: profile, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken }
}

export const revokeSession = async (refreshToken: string) => {
  try {
    const claims = verifyRefreshToken(refreshToken)
    await prisma.userSession.updateMany({
      where: { id: claims.sessionId, userId: claims.userId },
      data: { revokedAt: new Date(), refreshTokenHash: '' },
    })
  } catch (error) {
    // no-op for invalid token
  }
}

export const getProfile = fetchProfile
export const verifyToken = (token: string): AuthClaims => verifyAccessToken(token)
