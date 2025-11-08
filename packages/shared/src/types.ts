import {
  CharacterStatus,
  CharacterVisibility,
  DialogStatus,
  ItemCategory,
  ItemRarity,
  MessageRole,
  PackType,
  PaymentStatus,
  PaymentType,
  QuotaWindow,
  SubscriptionStatus,
  SubscriptionTier,
} from './enums';

export interface CharacterVersion {
  id: string;
  characterId: string;
  systemPrompt: string;
  style: Record<string, unknown>;
  safetyPolicy: Record<string, unknown>;
  modelPreset: Record<string, unknown>;
  version: number;
  isActive: boolean;
  createdAt: Date;
}

export interface StoryNodeChoice {
  id: string;
  label_ru: string;
  next: string;
  requires?: {
    items?: string[];
  };
}

export interface StoryGateOffer {
  item_slug: string;
  text_ru: string;
}

export interface StoryNode {
  node_id: string;
  text_ru: string;
  choices: StoryNodeChoice[];
  offer_item?: StoryGateOffer;
}

export interface Story {
  id: string;
  characterId: string;
  title: string;
  arcJson: Record<string, unknown>;
  isPremium: boolean;
}

export interface Character {
  id: string;
  slug: string;
  name: string;
  visibility: CharacterVisibility;
  status: CharacterStatus;
  createdBy?: string | null;
  versions: CharacterVersion[];
  stories: Story[];
}

export interface Message {
  id: string;
  dialogId: string;
  role: MessageRole;
  content: string;
  tokensIn?: number | null;
  tokensOut?: number | null;
  createdAt: Date;
}

export interface Dialog {
  id: string;
  userId: string;
  characterId: string;
  storyId?: string | null;
  status: DialogStatus;
  summary?: string | null;
  modelOverride?: Record<string, unknown> | null;
  createdAt: Date;
  messages: Message[];
}

export interface MemoryEpisodic {
  id: string;
  userId: string;
  characterId: string;
  embedding: number[];
  text: string;
  createdAt: Date;
}

export interface Subscription {
  id: string;
  userId: string;
  tier: SubscriptionTier;
  startedAt: Date;
  renewsAt: Date;
  status: SubscriptionStatus;
}

export interface Entitlement {
  id: string;
  userId: string;
  pack: PackType;
  meta?: Record<string, unknown> | null;
  expiresAt?: Date | null;
}

export interface Payment {
  id: string;
  userId: string;
  type: PaymentType;
  xtrAmount: number;
  tgChargeId?: string | null;
  status: PaymentStatus;
  createdAt: Date;
  item?: string;
  tier?: SubscriptionTier;
}

export interface Quota {
  id: string;
  userId: string;
  windowStart: Date;
  messagesUsed: number;
  windowType: QuotaWindow;
}

export interface ItemPrice {
  id: string;
  itemId: string;
  variant?: string | null;
  xtrAmount: number;
  tierDiscount: Partial<Record<SubscriptionTier, number>>;
  createdAt: Date;
}

export interface Item {
  id: string;
  slug: string;
  titleRu: string;
  descriptionRu: string;
  category: ItemCategory;
  effect: Record<string, unknown>;
  rarity: ItemRarity;
  isActive: boolean;
  prices: ItemPrice[];
  createdAt: Date;
}

export interface Inventory {
  id: string;
  userId: string;
  itemId: string;
  qty: number;
  expiresAt?: Date | null;
  meta?: Record<string, unknown> | null;
  createdAt: Date;
}

export interface ActiveEffect {
  id: string;
  userId: string;
  dialogId?: string | null;
  itemId: string;
  effect: Record<string, unknown>;
  expiresAt: Date;
  createdAt: Date;
  remainingMessages?: number;
}

export interface User {
  id: string;
  tgId: string;
  locale?: string | null;
  createdAt: Date;
  dialogs: Dialog[];
  quotas: Quota[];
  subscriptions: Subscription[];
  entitlements: Entitlement[];
  payments: Payment[];
  inventory: Inventory[];
  activeEffects: ActiveEffect[];
  memory: MemoryEpisodic[];
}

export interface ActionOfferItem {
  type: 'OFFER_ITEM';
  item_slug: string;
  reason_ru?: string;
}

export interface ActionConsumeItem {
  type: 'CONSUME_ITEM';
  item_slug: string;
}

export interface ActionSetFlag {
  type: 'SET_FLAG';
  flag: string;
}

export type ActionEnvelopeAction = ActionOfferItem | ActionConsumeItem | ActionSetFlag;

export interface ActionEnvelope {
  user_visible_text: string;
  actions: ActionEnvelopeAction[];
  summary?: string | null;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

export interface OrchestratorHandleMessageInput {
  dialogId: string;
  userId: string;
  text: string;
}

export interface OrchestratorHandleMessageResult {
  userVisibleText: string;
  actions: ActionEnvelopeAction[];
  summary: string;
  tokensOut: number;
}

export interface Config {
  quotaDailyLimit: number;
  subscriptionSoftCap: number;
  subscriptionPeriodSeconds: number;
  priceSubscription: Record<SubscriptionTier, number>;
  pricePack: Record<string, number>;
}
