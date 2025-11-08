import dayjs from 'dayjs';
import { PrismaClient } from '@prisma/client';
import { getPrismaClient, getSubscriptionTier } from '@jani/db';
import { Inventory, Item, PaymentStatus, PaymentType, SubscriptionTier } from '@jani/shared';

export interface ShopItemView {
  item: Item;
  ownedQty: number;
  discounts: Partial<Record<SubscriptionTier, number>>;
}

export interface CheckoutResult {
  paymentId: string;
  total: number;
  currency: string;
}

export class ShopService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? getPrismaClient();
  }

  public async list(userId: string): Promise<ShopItemView[]> {
    const [items, inventory] = await Promise.all([
      this.prisma.item.findMany({ include: { prices: true }, where: { isActive: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.inventory.findMany({ where: { userId } }),
    ]);
    return items.map((item) => {
      const owned = inventory.find((entry) => entry.itemId === item.id)?.qty ?? 0;
      const price = item.prices[0];
      const discounts = (price?.tierDiscount as Partial<Record<SubscriptionTier, number>>) ?? {};
      return {
        item: {
          id: item.id,
          slug: item.slug,
          titleRu: item.titleRu,
          descriptionRu: item.descriptionRu,
          category: item.category,
          effect: item.effect as Record<string, unknown>,
          rarity: item.rarity,
          isActive: item.isActive,
          prices: item.prices.map((price) => ({
            id: price.id,
            itemId: price.itemId,
            variant: price.variant,
            xtrAmount: price.xtrAmount,
            tierDiscount: price.tierDiscount as Partial<Record<SubscriptionTier, number>>,
            createdAt: price.createdAt,
          })),
          createdAt: item.createdAt,
        } as Item,
        ownedQty: owned,
        discounts,
      };
    });
  }

  public async checkout(userId: string, itemSlug: string, quantity = 1): Promise<CheckoutResult> {
    const tier = await getSubscriptionTier(this.prisma, userId);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.item.findUnique({ where: { slug: itemSlug }, include: { prices: true } });
      if (!item || !item.prices.length) {
        throw new Error(`Item ${itemSlug} not found`);
      }
      const price = item.prices[0];
      const discounts = (price.tierDiscount as Partial<Record<SubscriptionTier, number>>) ?? {};
      const discount = discounts[tier] ?? 0;
      const total = Math.max(0, Math.round(price.xtrAmount * quantity * (1 - discount / 100)));
      const payment = await tx.payment.create({
        data: {
          userId,
          type: PaymentType.OneOff,
          xtrAmount: total,
          item: item.slug,
          status: PaymentStatus.Paid,
        },
      });
      await tx.inventory.upsert({
        where: { userId_itemId: { userId, itemId: item.id } },
        update: { qty: { increment: quantity } },
        create: { userId, itemId: item.id, qty: quantity },
      });
      return {
        paymentId: payment.id,
        total,
        currency: 'XTR',
      };
    });
  }

  public async consume(userId: string, dialogId: string, itemSlug: string): Promise<{ inventory: Inventory; effect: Record<string, unknown> }> {
    const item = await this.prisma.item.findUnique({ where: { slug: itemSlug } });
    if (!item) {
      throw new Error(`Item ${itemSlug} not found`);
    }
    const inventoryBefore = await this.prisma.inventory.findUnique({
      where: { userId_itemId: { userId, itemId: item.id } },
    });
    if (!inventoryBefore || inventoryBefore.qty <= 0) {
      throw new Error('Item not owned');
    }
    const inventory = await this.prisma.inventory.update({
      where: { userId_itemId: { userId, itemId: item.id } },
      data: { qty: { decrement: 1 } },
    });
    const effect = item.effect as Record<string, unknown>;
    const ttlMessages = (effect.ttl_messages as number | undefined) ?? undefined;
    const ttlSeconds = (effect.ttl_seconds as number | undefined) ?? undefined;
    const expiresAt = ttlSeconds ? dayjs().add(ttlSeconds, 'second').toDate() : dayjs().add(1, 'day').toDate();
    await this.prisma.activeEffect.create({
      data: {
        userId,
        dialogId,
        itemId: item.id,
        effect,
        expiresAt,
        remainingMessages: ttlMessages ?? null,
      },
    });
    return {
      inventory: {
        ...inventory,
        meta: inventory.meta as Record<string, unknown> | null,
      } as Inventory,
      effect,
    };
  }
}
