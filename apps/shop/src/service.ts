import dayjs from 'dayjs';
import { InMemoryDatabase } from '@jani/db';
import { Inventory, Item, PaymentType, SubscriptionTier } from '@jani/shared';

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
  constructor(private readonly db: InMemoryDatabase) {}

  public list(userId: string): ShopItemView[] {
    const tier = this.db.getSubscriptionTier(userId);
    const user = this.db.getUserById(userId);
    const inventory = user?.inventory ?? [];
    return this.db.listItems().map((item) => ({
      item,
      ownedQty: inventory.find((inv) => inv.itemId === item.id)?.qty ?? 0,
      discounts: item.prices[0]?.tierDiscount ?? {},
    }));
  }

  public checkout(userId: string, itemSlug: string, quantity = 1): CheckoutResult {
    const item = this.db.getItemBySlug(itemSlug);
    if (!item) {
      throw new Error(`Item ${itemSlug} not found`);
    }
    const tier = this.db.getSubscriptionTier(userId);
    const price = item.prices[0];
    const discount = price.tierDiscount?.[tier] ?? 0;
    const total = Math.round(price.xtrAmount * quantity * (1 - discount / 100));
    const payment = this.db.recordPayment({ userId, type: PaymentType.OneOff, xtrAmount: total, item: item.slug });
    this.db.adjustInventory({ userId, itemId: item.id, qty: quantity });
    return {
      paymentId: payment.id,
      total,
      currency: 'XTR',
    };
  }

  public consume(userId: string, dialogId: string, itemSlug: string): { inventory: Inventory; effect: Record<string, unknown> } {
    const item = this.db.getItemBySlug(itemSlug);
    if (!item) {
      throw new Error(`Item ${itemSlug} not found`);
    }
    const inventoryBefore = this.db.getUserById(userId)?.inventory.find((inv) => inv.itemId === item.id);
    if (!inventoryBefore || inventoryBefore.qty <= 0) {
      throw new Error('Item not owned');
    }
    const inventory = this.db.consumeInventory(userId, item.id);
    const ttlMessages = (item.effect.ttl_messages as number | undefined) ?? undefined;
    const ttlSeconds = (item.effect.ttl_seconds as number | undefined) ?? undefined;
    const expiresAt = ttlSeconds ? dayjs().add(ttlSeconds, 'second').toDate() : dayjs().add(1, 'day').toDate();
    this.db.addActiveEffect({
      userId,
      dialogId,
      itemId: item.id,
      effect: item.effect,
      expiresAt,
      remainingMessages: ttlMessages,
    });
    return { inventory, effect: item.effect };
  }
}
