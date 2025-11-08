import dayjs from 'dayjs';
import { nanoid } from 'nanoid';
import { InMemoryDatabase, PendingInvoiceRecord } from '@jani/db';
import { PackType, Payment, PaymentType, SubscriptionTier } from '@jani/shared';

export interface SendInvoicePayload {
  title: string;
  description: string;
  payload: string;
  currency: string;
  prices: Array<{ label: string; amount: number }>;
  provider_token?: string;
}

export interface InvoiceResult {
  invoiceId: string;
  total: number;
  currency: string;
  description: string;
  paymentUrl?: string;
  sendInvoicePayload: SendInvoicePayload;
}

export interface InvoiceOptions {
  createLink?: boolean;
  sendToChatId?: number;
}

export type PaymentFulfillmentKind = 'subscription' | 'pack' | 'inventory';

export interface PaymentFulfillment {
  kind: PaymentFulfillmentKind;
  tier?: SubscriptionTier;
  pack?: PackType;
  itemSlug?: string;
  quantity?: number;
  dialogId?: string;
}

export interface PaymentFulfillmentResult {
  payment: Payment;
  fulfillment: PaymentFulfillment;
}

interface PreparedInvoice {
  record: PendingInvoiceRecord;
  sendInvoicePayload: SendInvoicePayload;
}

export class BillingService {
  private readonly botToken = process.env.TELEGRAM_BOT_TOKEN;
  private readonly providerToken = process.env.TELEGRAM_PAYMENTS_PROVIDER_TOKEN;
  private readonly apiBase = this.botToken ? `https://api.telegram.org/bot${this.botToken}` : null;

  constructor(private readonly db: InMemoryDatabase) {}

  public async createSubscriptionInvoice(
    userId: string,
    tier: SubscriptionTier,
    options?: InvoiceOptions,
  ): Promise<InvoiceResult> {
    const config = this.db.getConfig();
    const total = config.priceSubscription[tier];
    const description = `Подписка ${tier}`;
    const title = `JANI — ${description}`;
    const prepared = this.prepareInvoice({
      userId,
      kind: 'subscription',
      total,
      title,
      description,
      meta: { tier },
    });
    return this.issueInvoice(prepared, options);
  }

  public async createPackInvoice(userId: string, pack: PackType, options?: InvoiceOptions): Promise<InvoiceResult> {
    const config = this.db.getConfig();
    const priceKey = pack as unknown as string;
    const total = config.pricePack[priceKey] ?? 0;
    const description = `Пакет ${pack}`;
    const title = `JANI — ${description}`;
    const prepared = this.prepareInvoice({
      userId,
      kind: 'pack',
      total,
      title,
      description,
      meta: { pack },
    });
    return this.issueInvoice(prepared, options);
  }

  public async createItemInvoice(
    userId: string,
    itemSlug: string,
    quantity = 1,
    options?: InvoiceOptions,
    dialogId?: string,
  ): Promise<InvoiceResult> {
    const item = this.db.getItemBySlug(itemSlug);
    if (!item) {
      throw new Error(`Item ${itemSlug} not found`);
    }
    const tier = this.db.getSubscriptionTier(userId);
    const price = item.prices[0];
    if (!price) {
      throw new Error(`Item ${itemSlug} has no price`);
    }
    const discount = price.tierDiscount?.[tier] ?? 0;
    const total = Math.max(1, Math.round(price.xtrAmount * quantity * (1 - discount / 100)));
    const prepared = this.prepareInvoice({
      userId,
      kind: 'inventory',
      total,
      title: item.titleRu,
      description: item.descriptionRu,
      meta: { itemSlug, quantity, dialogId },
    });
    return this.issueInvoice(prepared, options);
  }

  public verifyPreCheckoutQuery(payload: string, totalAmount: number): boolean {
    const pending = this.db.getPendingInvoice(payload);
    if (!pending) {
      return false;
    }
    return pending.total === totalAmount;
  }

  public async handleSuccessfulPayment(input: {
    payload: string;
    telegramPaymentChargeId: string;
    totalAmount: number;
    currency: string;
  }): Promise<PaymentFulfillmentResult | null> {
    const pending = this.db.getPendingInvoice(input.payload);
    if (!pending) {
      return null;
    }
    if (pending.total !== input.totalAmount || pending.currency !== input.currency) {
      throw new Error('Payment amount mismatch');
    }
    try {
      const payment = this.db.recordPayment({
        userId: pending.userId,
        type: pending.kind === 'subscription' ? PaymentType.Subscription : PaymentType.OneOff,
        xtrAmount: pending.total,
        tier: pending.tier,
        item: pending.pack ?? pending.itemSlug,
        tgChargeId: input.telegramPaymentChargeId,
        quantity: pending.quantity,
      });
      switch (pending.kind) {
        case 'subscription':
          if (pending.tier) {
            this.db.upsertSubscription({ userId: pending.userId, tier: pending.tier });
          }
          break;
        case 'pack':
          if (pending.pack) {
            const expiresAt =
              pending.pack === PackType.Memory ? dayjs().add(30, 'day').toDate() : null;
            this.db.addEntitlement(pending.userId, pending.pack, expiresAt ?? undefined);
          }
          break;
        case 'inventory':
          if (pending.itemSlug) {
            const item = this.db.getItemBySlug(pending.itemSlug);
            if (!item) {
              throw new Error(`Item ${pending.itemSlug} not found for fulfillment`);
            }
            const qty = pending.quantity ?? 1;
            this.db.adjustInventory({ userId: pending.userId, itemId: item.id, qty });
          }
          break;
        default:
          break;
      }
      return {
        payment,
        fulfillment: {
          kind: pending.kind,
          tier: pending.tier,
          pack: pending.pack,
          itemSlug: pending.itemSlug,
          quantity: pending.quantity,
          dialogId: pending.dialogId,
        },
      };
    } finally {
      this.db.deletePendingInvoice(pending.payload);
    }
  }

  public refundPayment(paymentId: string): void {
    const payment = this.db.refundPayment(paymentId);
    if (!payment) {
      return;
    }
    if (payment.type === PaymentType.Subscription && payment.tier) {
      this.db.upsertSubscription({ userId: payment.userId, tier: SubscriptionTier.Free });
    }
    if (payment.item) {
      if (payment.item === PackType.Memory) {
        this.db.revokeEntitlement(payment.userId, PackType.Memory);
      } else if (payment.item === PackType.Story) {
        this.db.revokeEntitlement(payment.userId, PackType.Story);
      } else if (payment.item === PackType.Creator) {
        this.db.revokeEntitlement(payment.userId, PackType.Creator);
      } else {
        const item = this.db.getItemBySlug(payment.item);
        if (item) {
          const qty = payment.quantity ?? 1;
          this.db.adjustInventory({ userId: payment.userId, itemId: item.id, qty: -qty });
        }
      }
    }
  }

  private prepareInvoice(input: {
    userId: string;
    kind: PaymentFulfillmentKind;
    total: number;
    title: string;
    description: string;
    meta?: Partial<Pick<PendingInvoiceRecord, 'tier' | 'pack' | 'itemSlug' | 'quantity' | 'dialogId'>>;
  }): PreparedInvoice {
    const payload = `inv:${input.kind}:${input.userId}:${nanoid(10)}`;
    const record: PendingInvoiceRecord = {
      payload,
      userId: input.userId,
      kind: input.kind,
      total: input.total,
      currency: 'XTR',
      description: input.description,
      createdAt: new Date(),
      tier: input.meta?.tier,
      pack: input.meta?.pack,
      itemSlug: input.meta?.itemSlug,
      quantity: input.meta?.quantity,
      dialogId: input.meta?.dialogId,
    };
    const sendInvoicePayload: SendInvoicePayload = {
      title: input.title,
      description: input.description,
      payload,
      currency: 'XTR',
      prices: [
        {
          label: input.title,
          amount: input.total,
        },
      ],
    };
    if (this.providerToken) {
      sendInvoicePayload.provider_token = this.providerToken;
    }
    return { record, sendInvoicePayload };
  }

  private async issueInvoice(prepared: PreparedInvoice, options?: InvoiceOptions): Promise<InvoiceResult> {
    const createLink = options?.createLink ?? true;
    const sendToChatId = options?.sendToChatId;
    if (!createLink && typeof sendToChatId === 'undefined') {
      throw new Error('Invoice must be created as link or sent to a chat');
    }
    let paymentUrl: string | undefined;
    if (createLink) {
      paymentUrl = await this.createInvoiceLink(prepared.sendInvoicePayload);
    }
    if (typeof sendToChatId !== 'undefined') {
      await this.sendInvoice(sendToChatId, prepared.sendInvoicePayload);
    }
    this.db.savePendingInvoice(prepared.record);
    return {
      invoiceId: prepared.record.payload,
      total: prepared.record.total,
      currency: prepared.record.currency,
      description: prepared.record.description,
      paymentUrl,
      sendInvoicePayload: prepared.sendInvoicePayload,
    };
  }

  private async createInvoiceLink(payload: SendInvoicePayload): Promise<string> {
    const result = await this.callTelegram<string>('createInvoiceLink', payload);
    return result;
  }

  private async sendInvoice(chatId: number, payload: SendInvoicePayload): Promise<void> {
    await this.callTelegram('sendInvoice', {
      chat_id: chatId,
      ...payload,
    });
  }

  private async callTelegram<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    if (!this.apiBase) {
      throw new Error('TELEGRAM_BOT_TOKEN is not configured');
    }
    const response = await fetch(`${this.apiBase}/${method}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      throw new Error(`Telegram API HTTP error ${response.status}`);
    }
    const data = await response.json();
    if (!data.ok) {
      throw new Error(`Telegram API error: ${data.description ?? 'unknown error'}`);
    }
    return data.result as T;
  }
}
