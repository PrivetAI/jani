import { z } from 'zod'
import { PublicUserProfile, UserRole, UserTier } from '@jani/shared'

export type AuthSessionChannel = 'miniapp' | 'bot' | 'admin'

export interface AuthClaims {
  userId: string
  roles: UserRole[]
  tier: UserTier
  sessionId: string
}

export interface AuthTokens {
  accessToken: string
  refreshToken: string
  refreshTokenExpiresAt: Date
}

export interface AuthResult {
  user: PublicUserProfile
  accessToken: string
}

export interface LoginResult extends AuthResult {
  refreshToken: string
}

export interface AuthSessionMeta {
  channel?: AuthSessionChannel
  ipAddress?: string | null
  userAgent?: string | null
}

export const TelegramUserSchema = z.object({
  id: z.number(),
  username: z.string().optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  language_code: z.string().optional(),
})

export type TelegramUserPayload = z.infer<typeof TelegramUserSchema>
