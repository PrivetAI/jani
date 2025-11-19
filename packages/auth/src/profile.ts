import { PublicUserProfile, UserPermissions, UserRole, UserTier } from '@jani/shared'

export interface UserRecordLike {
  id: string
  telegramId: bigint | null
  username: string | null
  firstName: string | null
  lastName: string | null
  locale: string | null
  roles: UserRole[]
  tier: UserTier
}

export const buildPermissions = (tier: UserTier, entitlements: string[]): UserPermissions => ({
  premiumContent: tier !== 'free',
  creatorContent: tier !== 'free' || entitlements.includes('creator-pack'),
  storyPack: entitlements.includes('story-pack'),
  memoryPack: entitlements.includes('memory-pack'),
})

export const mapUserToProfile = (user: UserRecordLike, entitlements: string[]): PublicUserProfile => ({
  id: user.id,
  telegramId: user.telegramId ? user.telegramId.toString() : undefined,
  username: user.username ?? undefined,
  firstName: user.firstName ?? undefined,
  lastName: user.lastName ?? undefined,
  locale: user.locale,
  roles: user.roles,
  tier: user.tier,
  entitlements,
  permissions: buildPermissions(user.tier, entitlements),
})
