import { z } from 'zod'

export type UserTier = 'free' | 'plus' | 'pro' | 'ultra'
export type UserRole = 'user' | 'admin' | 'creator'

export interface UserPermissions {
  premiumContent: boolean
  creatorContent: boolean
  storyPack: boolean
  memoryPack: boolean
}

export interface PublicUserProfile {
  id: string
  telegramId?: string
  username?: string
  firstName?: string
  lastName?: string
  locale?: string | null
  roles: UserRole[]
  tier: UserTier
  entitlements: string[]
  permissions: UserPermissions
}

export interface LimitStatus {
  dailyLimit: number
  dailyUsed: number
  softCap: number
  unlimited: boolean
  tier: UserTier
}

export const ActionSchema = z.object({
  type: z.enum(['OFFER_ITEM', 'CONSUME_ITEM', 'SET_FLAG', 'PROGRESS_STORY']),
  item_id: z.string().optional(),
  flag: z.string().optional(),
  node_id: z.string().optional(),
})

export const ActionEnvelopeSchema = z.object({
  user_visible_text: z.string(),
  actions: z.array(ActionSchema).optional().default([]),
})

export type Action = z.infer<typeof ActionSchema>
export type ActionEnvelope = z.infer<typeof ActionEnvelopeSchema>

export type ItemEffect =
  | { type: 'memory.boost'; topK: number; ttl_messages: number }
  | { type: 'llm.fastlane'; model: string; ttl_messages: number }
  | { type: 'gate.key'; key: string }
  | { type: 'style.mood'; mood: string; ttl_hours: number }

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
  }
}
