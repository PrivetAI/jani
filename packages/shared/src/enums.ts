export enum CharacterVisibility {
  Public = 'public',
  Premium = 'premium',
  Creator = 'creator',
}

export enum CharacterStatus {
  Draft = 'draft',
  Live = 'live',
}

export enum MessageRole {
  User = 'user',
  Assistant = 'assistant',
  System = 'system',
}

export enum DialogStatus {
  Open = 'open',
  Closed = 'closed',
}

export enum SubscriptionTier {
  Free = 'Free',
  Plus = 'Plus',
  Pro = 'Pro',
  Ultra = 'Ultra',
}

export enum SubscriptionStatus {
  Active = 'active',
  Canceled = 'canceled',
  PastDue = 'past_due',
}

export enum PackType {
  Story = 'Story',
  Memory = 'Memory',
  Creator = 'Creator',
}

export enum PaymentType {
  OneOff = 'oneoff',
  Subscription = 'subscription',
}

export enum PaymentStatus {
  Paid = 'paid',
  Refunded = 'refunded',
  Failed = 'failed',
}

export enum QuotaWindow {
  Daily = 'daily',
  Rolling24h = 'rolling24h',
}

export enum ItemCategory {
  Consumable = 'consumable',
  Key = 'key',
  Booster = 'booster',
  Cosmetic = 'cosmetic',
  Utility = 'utility',
}

export enum ItemRarity {
  Common = 'common',
  Rare = 'rare',
  Epic = 'epic',
  Legendary = 'legendary',
}
