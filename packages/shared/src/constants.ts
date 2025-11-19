export const QUOTA = {
  DAILY_LIMIT_FREE: 50,
  SUBSCRIPTION_SOFTCAP: 2000,
} as const

export const DISCOUNTS = {
  plus: 0.05,
  pro: 0.1,
  ultra: 0.15,
} as const

export const CONTEXT_LIMITS = {
  MAX_PAIRS: 4,
  SUMMARY_MAX_TOKENS: 200,
} as const

export const VECTOR_TOP_K = {
  free: 0,
  plus: 3,
  pro: 5,
  ultra: 7,
} as const

export const TTL_DEFAULTS = {
  MEMORY_BOOST_MESSAGES: 10,
  FASTLANE_MESSAGES: 5,
  STYLE_MOOD_HOURS: 24,
} as const
