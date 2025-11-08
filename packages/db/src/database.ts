import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import {
  ActionEnvelopeAction,
  ActiveEffect,
  Character,
  CharacterStatus,
  CharacterVisibility,
  Config,
  Dialog,
  DialogStatus,
  Entitlement,
  Inventory,
  Item,
  ItemPrice,
  Message,
  MessageRole,
  PackType,
  Payment,
  PaymentStatus,
  PaymentType,
  Quota,
  QuotaWindow,
  Story,
  Subscription,
  SubscriptionStatus,
  SubscriptionTier,
  User,
} from '@jani/shared';

import charactersSeed from '../seeds/characters.json';
import itemsSeed from '../seeds/items.json';

type UserInternal = User;

type CharacterSeed = Omit<Character, 'versions' | 'stories'> & {
  versions: Array<Omit<Character['versions'][number], 'createdAt'> & { createdAt: string }>;
  stories: Array<Omit<Character['stories'][number], 'arcJson'> & {
    arcJson: Record<string, unknown>;
  }>;
};

type ItemSeed = Omit<Item, 'prices' | 'createdAt'> & {
  createdAt: string;
  prices: Array<Omit<ItemPrice, 'createdAt'> & { createdAt: string }>;
};

export interface DialogCreationInput {
  userId: string;
  characterId: string;
  storyId?: string;
}

export interface MessageAppendInput {
  dialogId: string;
  role: MessageRole;
  content: string;
  tokensIn?: number;
  tokensOut?: number;
}

export interface InventoryAdjustment {
  userId: string;
  itemId: string;
  qty: number;
  meta?: Record<string, unknown> | null;
  expiresAt?: Date | null;
}

export interface SubscriptionUpsertInput {
  userId: string;
  tier: SubscriptionTier;
  now?: Date;
}

export interface PaymentRecordInput {
  userId: string;
  type: PaymentType;
  xtrAmount: number;
  item?: string;
  tier?: SubscriptionTier;
  tgChargeId?: string;
}

export interface MemoryRecord {
  userId: string;
  characterId: string;
  text: string;
  embedding: number[];
}

const toDate = (iso: string): Date => dayjs(iso).toDate();

const toCharacter = (seed: CharacterSeed): Character => ({
  ...seed,
  versions: seed.versions.map((version) => ({ ...version, createdAt: toDate(version.createdAt) })),
  stories: seed.stories.map((story) => ({ ...story })),
});

const toItem = (seed: ItemSeed): Item => ({
  ...seed,
  createdAt: toDate(seed.createdAt),
  prices: seed.prices.map((price) => ({
    ...price,
    createdAt: toDate(price.createdAt),
  })),
});

export class InMemoryDatabase {
  private readonly config: Config;
  private readonly characters: Character[];
  private readonly items: Item[];
  private readonly users = new Map<string, UserInternal>();
  private readonly dialogs = new Map<string, Dialog>();

  constructor(config: Config) {
    this.config = config;
    this.characters = (charactersSeed as CharacterSeed[]).map(toCharacter);
    this.items = (itemsSeed as ItemSeed[]).map(toItem);
  }

  public getCharacters(visibility?: string): Character[] {
    if (!visibility) {
      return this.characters;
    }
    return this.characters.filter((char) => char.visibility === visibility);
  }

  public getCharacter(id: string): Character | undefined {
    return this.characters.find((char) => char.id === id || char.slug === id);
  }

  public ensureUser(tgId: string, locale?: string | null): UserInternal {
    for (const user of this.users.values()) {
      if (user.tgId === tgId) {
        if (locale && user.locale !== locale) {
          user.locale = locale;
        }
        return user;
      }
    }
    const id = nanoid();
    const now = new Date();
    const user: UserInternal = {
      id,
      tgId,
      locale: locale ?? null,
      createdAt: now,
      dialogs: [],
      quotas: [],
      subscriptions: [
        {
          id: nanoid(),
          userId: id,
          tier: SubscriptionTier.Free,
          startedAt: now,
          renewsAt: dayjs(now).add(this.config.subscriptionPeriodSeconds, 'second').toDate(),
          status: SubscriptionStatus.Active,
        },
      ],
      entitlements: [],
      payments: [],
      inventory: [],
      activeEffects: [],
      memory: [],
    };
    this.users.set(id, user);
    return user;
  }

  public getUserById(userId: string): UserInternal | undefined {
    return this.users.get(userId);
  }

  public createDialog(input: DialogCreationInput): Dialog {
    const dialog: Dialog = {
      id: nanoid(),
      userId: input.userId,
      characterId: input.characterId,
      storyId: input.storyId ?? null,
      status: DialogStatus.Open,
      summary: null,
      modelOverride: null,
      createdAt: new Date(),
      messages: [],
    };
    this.dialogs.set(dialog.id, dialog);
    const user = this.getUserById(input.userId);
    if (user) {
      user.dialogs.push(dialog);
    }
    return dialog;
  }

  public getDialog(dialogId: string): Dialog | undefined {
    return this.dialogs.get(dialogId);
  }

  public appendMessage(input: MessageAppendInput): Message {
    const dialog = this.getDialog(input.dialogId);
    if (!dialog) {
      throw new Error(`Dialog ${input.dialogId} not found`);
    }
    const message: Message = {
      id: nanoid(),
      dialogId: dialog.id,
      role: input.role,
      content: input.content,
      tokensIn: input.tokensIn ?? null,
      tokensOut: input.tokensOut ?? null,
      createdAt: new Date(),
    };
    dialog.messages.push(message);
    return message;
  }

  public updateSummary(dialogId: string, summary: string): void {
    const dialog = this.getDialog(dialogId);
    if (!dialog) {
      throw new Error(`Dialog ${dialogId} not found`);
    }
    dialog.summary = summary;
  }

  public getMessages(dialogId: string): Message[] {
    const dialog = this.getDialog(dialogId);
    return dialog?.messages ?? [];
  }

  public incrementQuota(userId: string, amount: number): Quota {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    const now = dayjs();
    const windowStart = now.startOf('day');
    let quota = user.quotas.find((q) => q.windowType === QuotaWindow.Daily && dayjs(q.windowStart).isSame(windowStart, 'day'));
    if (!quota) {
      quota = {
        id: nanoid(),
        userId,
        windowStart: windowStart.toDate(),
        messagesUsed: 0,
        windowType: QuotaWindow.Daily,
      };
      user.quotas.push(quota);
    }
    quota.messagesUsed += amount;
    return quota;
  }

  public getQuotaToday(userId: string): Quota {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    const now = dayjs();
    const windowStart = now.startOf('day');
    let quota = user.quotas.find((q) => q.windowType === QuotaWindow.Daily && dayjs(q.windowStart).isSame(windowStart, 'day'));
    if (!quota) {
      quota = {
        id: nanoid(),
        userId,
        windowStart: windowStart.toDate(),
        messagesUsed: 0,
        windowType: QuotaWindow.Daily,
      };
      user.quotas.push(quota);
    }
    return quota;
  }

  public getConfig(): Config {
    return this.config;
  }

  public listItems(): Item[] {
    return this.items.filter((item) => item.isActive);
  }

  public getItemBySlug(slug: string): Item | undefined {
    return this.items.find((item) => item.slug === slug);
  }

  public adjustInventory(adjustment: InventoryAdjustment): Inventory {
    const user = this.getUserById(adjustment.userId);
    if (!user) {
      throw new Error(`User ${adjustment.userId} not found`);
    }
    let inventory = user.inventory.find((inv) => inv.userId === adjustment.userId && inv.itemId === adjustment.itemId);
    if (!inventory) {
      inventory = {
        id: nanoid(),
        userId: adjustment.userId,
        itemId: adjustment.itemId,
        qty: 0,
        createdAt: new Date(),
        expiresAt: null,
        meta: null,
      };
      user.inventory.push(inventory);
    }
    inventory.qty += adjustment.qty;
    if (inventory.qty < 0) {
      inventory.qty = 0;
    }
    if (typeof adjustment.expiresAt !== 'undefined') {
      inventory.expiresAt = adjustment.expiresAt;
    }
    if (typeof adjustment.meta !== 'undefined') {
      inventory.meta = adjustment.meta;
    }
    return inventory;
  }

  public consumeInventory(userId: string, itemId: string): Inventory {
    const inventory = this.adjustInventory({ userId, itemId, qty: -1 });
    return inventory;
  }

  public addActiveEffect(effect: Omit<ActiveEffect, 'id' | 'createdAt'> & { remainingMessages?: number }): ActiveEffect {
    const user = this.getUserById(effect.userId);
    if (!user) {
      throw new Error(`User ${effect.userId} not found`);
    }
    const record: ActiveEffect = {
      ...effect,
      id: nanoid(),
      createdAt: new Date(),
      remainingMessages: effect.remainingMessages,
    };
    user.activeEffects.push(record);
    return record;
  }

  public listActiveEffects(userId: string, dialogId?: string): ActiveEffect[] {
    const user = this.getUserById(userId);
    if (!user) {
      return [];
    }
    return user.activeEffects.filter((effect) => !dialogId || effect.dialogId === dialogId || !effect.dialogId);
  }

  public decayEffects(userId: string): void {
    const user = this.getUserById(userId);
    if (!user) {
      return;
    }
    const now = dayjs();
    user.activeEffects = user.activeEffects.filter((effect) => {
      const expired = now.isAfter(effect.expiresAt);
      if (expired) {
        return false;
      }
      if (typeof effect.remainingMessages === 'number' && effect.remainingMessages <= 0) {
        return false;
      }
      return true;
    });
  }

  public decrementEffectMessages(userId: string, dialogId: string): void {
    const user = this.getUserById(userId);
    if (!user) {
      return;
    }
    for (const effect of user.activeEffects) {
      if (effect.dialogId && effect.dialogId !== dialogId) {
        continue;
      }
      if (typeof effect.remainingMessages === 'number' && effect.remainingMessages > 0) {
        effect.remainingMessages -= 1;
      }
    }
    this.decayEffects(userId);
  }

  public upsertSubscription(input: SubscriptionUpsertInput): Subscription {
    const user = this.getUserById(input.userId);
    if (!user) {
      throw new Error(`User ${input.userId} not found`);
    }
    const now = input.now ?? new Date();
    let subscription = user.subscriptions.find((sub) => sub.status === SubscriptionStatus.Active);
    if (!subscription) {
      subscription = {
        id: nanoid(),
        userId: input.userId,
        tier: input.tier,
        startedAt: now,
        renewsAt: dayjs(now).add(this.config.subscriptionPeriodSeconds, 'second').toDate(),
        status: SubscriptionStatus.Active,
      };
      user.subscriptions.push(subscription);
    }
    subscription.tier = input.tier;
    subscription.status = SubscriptionStatus.Active;
    subscription.startedAt = now;
    subscription.renewsAt = dayjs(now).add(this.config.subscriptionPeriodSeconds, 'second').toDate();
    return subscription;
  }

  public addEntitlement(userId: string, pack: PackType, expiresAt?: Date | null, meta?: Record<string, unknown> | null): Entitlement {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    const entitlement: Entitlement = {
      id: nanoid(),
      userId,
      pack,
      expiresAt: expiresAt ?? null,
      meta: meta ?? null,
    };
    user.entitlements.push(entitlement);
    return entitlement;
  }

  public revokeEntitlement(userId: string, pack: PackType): void {
    const user = this.getUserById(userId);
    if (!user) {
      return;
    }
    user.entitlements = user.entitlements.filter((entitlement) => entitlement.pack !== pack);
  }

  public recordPayment(input: PaymentRecordInput): Payment {
    const user = this.getUserById(input.userId);
    if (!user) {
      throw new Error(`User ${input.userId} not found`);
    }
    const payment: Payment = {
      id: nanoid(),
      userId: input.userId,
      type: input.type,
      xtrAmount: input.xtrAmount,
      item: input.item,
      tier: input.tier,
      status: PaymentStatus.Paid,
      tgChargeId: input.tgChargeId ?? null,
      createdAt: new Date(),
    };
    user.payments.push(payment);
    return payment;
  }

  public refundPayment(paymentId: string): Payment | undefined {
    for (const user of this.users.values()) {
      const payment = user.payments.find((p) => p.id === paymentId);
      if (payment) {
        payment.status = PaymentStatus.Refunded;
        return payment;
      }
    }
    return undefined;
  }

  public listPayments(userId: string): Payment[] {
    const user = this.getUserById(userId);
    return user?.payments ?? [];
  }

  public getSubscriptionTier(userId: string): SubscriptionTier {
    const user = this.getUserById(userId);
    if (!user) {
      throw new Error(`User ${userId} not found`);
    }
    const active = user.subscriptions.find((sub) => sub.status === SubscriptionStatus.Active);
    return active?.tier ?? SubscriptionTier.Free;
  }

  public ensureDailyQuota(userId: string): Quota {
    return this.getQuotaToday(userId);
  }

  public storeMemory(record: MemoryRecord): void {
    const user = this.getUserById(record.userId);
    if (!user) {
      throw new Error(`User ${record.userId} not found`);
    }
    user.memory.push({
      id: nanoid(),
      userId: record.userId,
      characterId: record.characterId,
      text: record.text,
      embedding: record.embedding,
      createdAt: new Date(),
    });
  }

  public retrieveMemories(userId: string, characterId: string, topK: number): string[] {
    const user = this.getUserById(userId);
    if (!user) {
      return [];
    }
    return user.memory
      .filter((memory) => memory.characterId === characterId)
      .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())
      .slice(0, topK)
      .map((memory) => memory.text);
  }

  public applyActions(userId: string, dialogId: string, actions: ActionEnvelopeAction[]): void {
    for (const action of actions) {
      switch (action.type) {
        case 'CONSUME_ITEM': {
          const item = this.items.find((i) => i.slug === action.item_slug);
          if (!item) {
            throw new Error(`Item ${action.item_slug} not found`);
          }
          this.consumeInventory(userId, item.id);
          const ttlMessages = (item.effect.ttl_messages as number | undefined) ?? null;
          const ttlSeconds = (item.effect.ttl_seconds as number | undefined) ?? null;
          const expiresAt = ttlSeconds ? dayjs().add(ttlSeconds, 'second').toDate() : dayjs().add(1, 'day').toDate();
          this.addActiveEffect({
            userId,
            dialogId,
            itemId: item.id,
            effect: item.effect,
            expiresAt,
            remainingMessages: ttlMessages ?? undefined,
          });
          break;
        }
        case 'SET_FLAG': {
          // Flags are stored as entitlements with pack type Creator and meta payload for simplicity.
          this.addEntitlement(userId, PackType.Creator, null, { flag: action.flag, dialogId });
          break;
        }
        case 'OFFER_ITEM':
        default:
          break;
      }
    }
  }

  public createCharacter(input: {
    slug: string;
    name: string;
    visibility: CharacterVisibility;
    status: CharacterStatus;
    createdBy?: string | null;
    systemPrompt: string;
    style?: Record<string, unknown>;
    safetyPolicy?: Record<string, unknown>;
    modelPreset?: Record<string, unknown>;
  }): Character {
    const character: Character = {
      id: nanoid(),
      slug: input.slug,
      name: input.name,
      visibility: input.visibility,
      status: input.status,
      createdBy: input.createdBy ?? null,
      versions: [
        {
          id: nanoid(),
          characterId: '',
          systemPrompt: input.systemPrompt,
          style: input.style ?? {},
          safetyPolicy: input.safetyPolicy ?? {},
          modelPreset: input.modelPreset ?? { model: 'openrouter/auto', temperature: 0.7 },
          version: 1,
          isActive: true,
          createdAt: new Date(),
        },
      ],
      stories: [],
    };
    character.versions[0].characterId = character.id;
    this.characters.push(character);
    return character;
  }

  public updateCharacter(characterId: string, patch: Partial<Omit<Character, 'id' | 'versions' | 'stories'>>): Character {
    const character = this.getCharacter(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }
    Object.assign(character, patch);
    return character;
  }

  public addCharacterStory(characterId: string, story: Omit<Story, 'id'> & { id?: string }): Story {
    const character = this.getCharacter(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }
    const record: Story = {
      id: story.id ?? nanoid(),
      characterId,
      title: story.title,
      arcJson: story.arcJson,
      isPremium: story.isPremium,
    };
    character.stories.push(record);
    return record;
  }

  public addCharacterVersion(characterId: string, version: {
    systemPrompt: string;
    style?: Record<string, unknown>;
    safetyPolicy?: Record<string, unknown>;
    modelPreset?: Record<string, unknown>;
    isActive?: boolean;
  }): void {
    const character = this.getCharacter(characterId);
    if (!character) {
      throw new Error(`Character ${characterId} not found`);
    }
    const record = {
      id: nanoid(),
      characterId,
      systemPrompt: version.systemPrompt,
      style: version.style ?? {},
      safetyPolicy: version.safetyPolicy ?? {},
      modelPreset: version.modelPreset ?? { model: 'openrouter/auto', temperature: 0.7 },
      version: Math.max(0, ...character.versions.map((v) => v.version)) + 1,
      isActive: version.isActive ?? false,
      createdAt: new Date(),
    };
    if (record.isActive) {
      for (const existing of character.versions) {
        existing.isActive = false;
      }
    }
    character.versions.push(record);
  }
}
