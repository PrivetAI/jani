import { randomUUID } from 'node:crypto';
import dayjs from 'dayjs';
import {
  CharacterStatus,
  CharacterVisibility,
  DialogStatus,
  MessageRole,
  PackType,
  PaymentStatus,
  PaymentType,
  Prisma,
  PrismaClient,
  QuotaWindow,
  SubscriptionStatus,
  SubscriptionTier,
} from '@prisma/client';
import { Config, defaultConfig } from '@jani/shared';

type Client = PrismaClient | Prisma.TransactionClient;

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
  meta?: Prisma.JsonValue | null;
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

const VECTOR_DIMENSION = 1536;

export interface MemoryRecord {
  userId: string;
  characterId: string;
  text: string;
  embedding: number[];
}

export const getConfig = (): Config => defaultConfig;

export const ensureUser = async (
  prisma: PrismaClient,
  tgId: string,
  locale?: string | null,
): Promise<Prisma.UserGetPayload<{ include: { subscriptions: true } }>> => {
  const now = new Date();
  const user = await prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({ include: { subscriptions: true }, where: { tgId } });
    if (existing) {
      if (locale && existing.locale !== locale) {
        await tx.user.update({ where: { id: existing.id }, data: { locale } });
        existing.locale = locale ?? null;
      }
      if (!existing.subscriptions.some((sub) => sub.status === SubscriptionStatus.active)) {
        await tx.subscription.create({
          data: {
            userId: existing.id,
            tier: SubscriptionTier.Free,
            startedAt: now,
            renewsAt: dayjs(now).add(defaultConfig.subscriptionPeriodSeconds, 'second').toDate(),
            status: SubscriptionStatus.active,
          },
        });
        existing.subscriptions = await tx.subscription.findMany({ where: { userId: existing.id } });
      }
      return existing;
    }
    const created = await tx.user.create({
      data: {
        tgId,
        locale: locale ?? null,
        subscriptions: {
          create: {
            tier: SubscriptionTier.Free,
            startedAt: now,
            renewsAt: dayjs(now).add(defaultConfig.subscriptionPeriodSeconds, 'second').toDate(),
            status: SubscriptionStatus.active,
          },
        },
      },
      include: { subscriptions: true },
    });
    return created;
  });
  return user;
};

export const getUserById = async (prisma: PrismaClient, userId: string) =>
  prisma.user.findUnique({
    where: { id: userId },
    include: {
      entitlements: true,
      subscriptions: true,
      inventory: true,
      activeEffects: true,
      dialogs: true,
    },
  });

export const getCharacters = async (prisma: PrismaClient, visibility?: string) =>
  prisma.character.findMany({
    where: visibility ? { visibility: visibility as any } : undefined,
    include: {
      versions: { orderBy: { createdAt: 'asc' } },
      stories: true,
    },
    orderBy: { createdAt: 'asc' },
  });

export const getCharacter = async (prisma: PrismaClient, id: string) =>
  prisma.character.findFirst({
    where: {
      OR: [{ id }, { slug: id }],
    },
    include: {
      versions: { orderBy: { createdAt: 'asc' } },
      stories: true,
    },
  });

export const createDialog = async (prisma: PrismaClient, input: DialogCreationInput) =>
  prisma.dialog.create({
    data: {
      userId: input.userId,
      characterId: input.characterId,
      storyId: input.storyId ?? null,
      status: DialogStatus.open,
    },
  });

export const getDialog = async (prisma: PrismaClient, dialogId: string) =>
  prisma.dialog.findUnique({
    where: { id: dialogId },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });

export const appendMessage = async (prisma: PrismaClient, input: MessageAppendInput) =>
  prisma.message.create({
    data: {
      dialogId: input.dialogId,
      role: input.role,
      content: input.content,
      tokensIn: input.tokensIn ?? null,
      tokensOut: input.tokensOut ?? null,
    },
  });

export const updateSummary = async (prisma: PrismaClient, dialogId: string, summary: string | null) =>
  prisma.dialog.update({
    where: { id: dialogId },
    data: { summary },
  });

export const incrementQuota = async (prisma: PrismaClient, userId: string, amount: number) => {
  const windowStart = dayjs().startOf('day').toDate();
  return prisma.quota.upsert({
    where: {
      userId_windowStart_windowType: {
        userId,
        windowStart,
        windowType: QuotaWindow.daily,
      },
    },
    update: {
      messagesUsed: { increment: amount },
    },
    create: {
      userId,
      windowStart,
      windowType: QuotaWindow.daily,
      messagesUsed: amount,
    },
  });
};

export const getQuotaToday = async (prisma: PrismaClient, userId: string) => {
  const windowStart = dayjs().startOf('day').toDate();
  return prisma.quota.upsert({
    where: {
      userId_windowStart_windowType: {
        userId,
        windowStart,
        windowType: QuotaWindow.daily,
      },
    },
    update: {},
    create: {
      userId,
      windowStart,
      windowType: QuotaWindow.daily,
      messagesUsed: 0,
    },
  });
};

export const getSubscriptionTier = async (prisma: PrismaClient, userId: string): Promise<SubscriptionTier> => {
  const active = await prisma.subscription.findFirst({
    where: { userId, status: SubscriptionStatus.active },
    orderBy: { startedAt: 'desc' },
  });
  return active?.tier ?? SubscriptionTier.Free;
};

export const listItems = async (prisma: PrismaClient) =>
  prisma.item.findMany({
    where: { isActive: true },
    include: { prices: { orderBy: { createdAt: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  });

export const getItemBySlug = async (prisma: PrismaClient, slug: string) =>
  prisma.item.findUnique({
    where: { slug },
    include: { prices: true },
  });

export const adjustInventory = async (prisma: PrismaClient, adjustment: InventoryAdjustment) => {
  const updateData: Prisma.InventoryUpdateInput = {
    qty: { increment: adjustment.qty },
  };
  if (typeof adjustment.meta !== 'undefined') {
    updateData.meta = adjustment.meta;
  }
  if (typeof adjustment.expiresAt !== 'undefined') {
    updateData.expiresAt = adjustment.expiresAt;
  }
  return prisma.inventory.upsert({
    where: {
      userId_itemId: {
        userId: adjustment.userId,
        itemId: adjustment.itemId,
      },
    },
    update: updateData,
    create: {
      userId: adjustment.userId,
      itemId: adjustment.itemId,
      qty: adjustment.qty,
      meta: typeof adjustment.meta === 'undefined' ? null : adjustment.meta,
      expiresAt: typeof adjustment.expiresAt === 'undefined' ? null : adjustment.expiresAt,
    },
  });
};

export const consumeInventory = async (prisma: PrismaClient, userId: string, itemId: string) =>
  prisma.inventory.update({
    where: {
      userId_itemId: {
        userId,
        itemId,
      },
    },
    data: {
      qty: { decrement: 1 },
    },
  });

export const addActiveEffect = async (
  prisma: PrismaClient,
  effect: {
    userId: string;
    dialogId?: string | null;
    itemId: string;
    effect: Prisma.JsonValue;
    expiresAt: Date;
    remainingMessages?: number;
  },
) =>
  prisma.activeEffect.create({
    data: {
      userId: effect.userId,
      dialogId: effect.dialogId ?? null,
      itemId: effect.itemId,
      effect: effect.effect,
      expiresAt: effect.expiresAt,
      remainingMessages: effect.remainingMessages ?? null,
    },
  });

export const listActiveEffects = async (prisma: PrismaClient, userId: string, dialogId?: string) =>
  prisma.activeEffect.findMany({
    where: {
      userId,
      ...(dialogId
        ? {
            OR: [{ dialogId }, { dialogId: null }],
          }
        : {}),
    },
  });

type Transaction = PrismaClient | Prisma.TransactionClient;

export const decayEffects = async (prisma: Transaction, userId: string) => {
  const now = new Date();
  await prisma.activeEffect.deleteMany({
    where: {
      userId,
      OR: [{ expiresAt: { lt: now } }, { remainingMessages: { lte: 0 } }],
    },
  });
};

export const decrementEffectMessages = async (prisma: PrismaClient, userId: string, dialogId: string) => {
  await prisma.$transaction(async (tx) => {
    const effects = await tx.activeEffect.findMany({
      where: {
        userId,
        OR: [{ dialogId }, { dialogId: null }],
        remainingMessages: { not: null },
      },
    });
    for (const effect of effects) {
      await tx.activeEffect.update({
        where: { id: effect.id },
        data: {
          remainingMessages: effect.remainingMessages && effect.remainingMessages > 0 ? effect.remainingMessages - 1 : effect.remainingMessages,
        },
      });
    }
    await decayEffects(tx, userId);
  });
};

export const upsertSubscription = async (prisma: PrismaClient, input: SubscriptionUpsertInput) => {
  const now = input.now ?? new Date();
  const renewsAt = dayjs(now).add(defaultConfig.subscriptionPeriodSeconds, 'second').toDate();
  const active = await prisma.subscription.findFirst({
    where: { userId: input.userId, status: SubscriptionStatus.active },
  });
  if (active) {
    return prisma.subscription.update({
      where: { id: active.id },
      data: {
        tier: input.tier,
        startedAt: now,
        renewsAt,
        status: SubscriptionStatus.active,
      },
    });
  }
  return prisma.subscription.create({
    data: {
      userId: input.userId,
      tier: input.tier,
      startedAt: now,
      renewsAt,
      status: SubscriptionStatus.active,
    },
  });
};

export const addEntitlement = async (
  prisma: PrismaClient,
  userId: string,
  pack: PackType,
  expiresAt?: Date | null,
  meta?: Prisma.JsonValue | null,
) =>
  prisma.entitlement.create({
    data: {
      userId,
      pack,
      expiresAt: expiresAt ?? null,
      meta: meta ?? null,
    },
  });

export const revokeEntitlement = async (prisma: PrismaClient, userId: string, pack: PackType) =>
  prisma.entitlement.deleteMany({ where: { userId, pack } });

export const recordPayment = async (prisma: PrismaClient, input: PaymentRecordInput) =>
  prisma.payment.create({
    data: {
      userId: input.userId,
      type: input.type,
      xtrAmount: input.xtrAmount,
      item: input.item ?? null,
      tier: input.tier ?? null,
      tgChargeId: input.tgChargeId ?? null,
      status: PaymentStatus.paid,
    },
  });

export const refundPayment = async (prisma: PrismaClient, paymentId: string) =>
  prisma.payment.update({
    where: { id: paymentId },
    data: { status: PaymentStatus.refunded },
  });

export const storeMemory = async (prisma: PrismaClient, record: MemoryRecord) => {
  const values = record.embedding.length >= VECTOR_DIMENSION
    ? record.embedding.slice(0, VECTOR_DIMENSION)
    : [...record.embedding, ...Array(VECTOR_DIMENSION - record.embedding.length).fill(0)];
  const vectorLiteral = `[${values.join(',')}]`;
  await prisma.$executeRawUnsafe(
    `INSERT INTO "MemoryEpisodic" ("id", "userId", "characterId", "embedding", "text") VALUES ($1, $2, $3, $4::vector, $5)`,
    randomUUID(),
    record.userId,
    record.characterId,
    vectorLiteral,
    record.text,
  );
};

export const retrieveMemories = async (
  prisma: PrismaClient,
  userId: string,
  characterId: string,
  topK: number,
): Promise<string[]> => {
  const memories = await prisma.memoryEpisodic.findMany({
    where: { userId, characterId },
    orderBy: { createdAt: 'desc' },
    take: topK,
  });
  return memories.map((memory) => memory.text);
};

export const applyActions = async (
  prisma: PrismaClient,
  userId: string,
  dialogId: string,
  actions: Array<
    | { type: 'CONSUME_ITEM'; item_slug: string }
    | { type: 'SET_FLAG'; flag: string }
    | { type: 'OFFER_ITEM'; item_slug: string; reason_ru?: string }
  >,
) => {
  for (const action of actions) {
    if (action.type === 'CONSUME_ITEM') {
      const item = await prisma.item.findUnique({ where: { slug: action.item_slug } });
      if (!item) {
        throw new Error(`Item ${action.item_slug} not found`);
      }
      await consumeInventory(prisma, userId, item.id);
      const ttlMessages = (item.effect as Record<string, unknown>)?.ttl_messages as number | undefined;
      const ttlSeconds = (item.effect as Record<string, unknown>)?.ttl_seconds as number | undefined;
      const expiresAt = ttlSeconds ? dayjs().add(ttlSeconds, 'second').toDate() : dayjs().add(1, 'day').toDate();
      await addActiveEffect(prisma, {
        userId,
        dialogId,
        itemId: item.id,
        effect: item.effect,
        expiresAt,
        remainingMessages: ttlMessages,
      });
    } else if (action.type === 'SET_FLAG') {
      await addEntitlement(prisma, userId, PackType.Creator, null, { flag: action.flag, dialogId });
    }
  }
};

export const createCharacter = async (
  prisma: PrismaClient,
  input: {
    slug: string;
    name: string;
    visibility: CharacterVisibility;
    status: CharacterStatus;
    createdBy?: string | null;
    systemPrompt: string;
    style?: Prisma.JsonValue;
    safetyPolicy?: Prisma.JsonValue;
    modelPreset?: Prisma.JsonValue;
  },
) =>
  prisma.character.create({
    data: {
      slug: input.slug,
      name: input.name,
      visibility: input.visibility,
      status: input.status,
      createdBy: input.createdBy ?? null,
      versions: {
        create: {
          systemPrompt: input.systemPrompt,
          style: input.style ?? {},
          safetyPolicy: input.safetyPolicy ?? {},
          modelPreset: input.modelPreset ?? { model: 'openrouter/auto', temperature: 0.7 },
          version: 1,
          isActive: true,
        },
      },
    },
    include: {
      versions: true,
      stories: true,
    },
  });
 
type StoryInput = {
  title: string;
  arcJson: Prisma.JsonValue;
  isPremium: boolean;
};

type VersionInput = {
  systemPrompt: string;
  style?: Prisma.JsonValue;
  safetyPolicy?: Prisma.JsonValue;
  modelPreset?: Prisma.JsonValue;
  isActive?: boolean;
};

export const updateCharacter = async (
  prisma: PrismaClient,
  characterId: string,
  patch: Partial<{ name: string; visibility: CharacterVisibility; status: CharacterStatus }>,
) =>
  prisma.character.update({
    where: { id: characterId },
    data: patch,
    include: { versions: true, stories: true },
  });

export const addCharacterStory = async (prisma: PrismaClient, characterId: string, story: StoryInput) =>
  prisma.story.create({
    data: {
      characterId,
      title: story.title,
      arcJson: story.arcJson,
      isPremium: story.isPremium,
    },
  });

export const addCharacterVersion = async (prisma: PrismaClient, characterId: string, version: VersionInput) =>
  prisma.$transaction(async (tx) => {
    if (version.isActive) {
      await tx.characterVersion.updateMany({
        where: { characterId },
        data: { isActive: false },
      });
    }
    const maxVersion = await tx.characterVersion.aggregate({
      where: { characterId },
      _max: { version: true },
    });
    await tx.characterVersion.create({
      data: {
        characterId,
        systemPrompt: version.systemPrompt,
        style: version.style ?? {},
        safetyPolicy: version.safetyPolicy ?? {},
        modelPreset: version.modelPreset ?? { model: 'openrouter/auto', temperature: 0.7 },
        version: (maxVersion._max.version ?? 0) + 1,
        isActive: version.isActive ?? false,
      },
    });
  });
