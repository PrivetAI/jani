import { authenticateTelegram, refreshSession, revokeSession, getProfile, verifyToken } from './service'
import { mapUserToProfile } from './profile'

export * from './types'
export { mapUserToProfile }
export const AuthService = {
  authenticateTelegram,
  refreshSession,
  revokeSession,
  getProfile,
  verifyToken,
  mapUserToProfile,
}
