import dayjs from 'dayjs';
import { InMemoryDatabase } from '@jani/db';
import {
  PackType,
  PaymentType,
  SubscriptionTier,
} from '@jani/shared';

export interface InvoiceResult {
  invoiceId: string;
  mock: boolean;
  total: number;
  currency: string;
  description: string;
}

export class BillingService {
  constructor(private readonly db: InMemoryDatabase) {}

  public createSubscriptionInvoice(userId: string, tier: SubscriptionTier): InvoiceResult {
    const config = this.db.getConfig();
    const amount = config.priceSubscription[tier];
    const invoiceId = `sub_${tier}_${Date.now()}`;
    this.db.recordPayment({ userId, type: PaymentType.Subscription, xtrAmount: amount, tier });
    this.db.upsertSubscription({ userId, tier });
    return {
      invoiceId,
      mock: true,
      total: amount,
      currency: 'XTR',
      description: `Подписка ${tier}`,
    };
  }

  public createPackInvoice(userId: string, pack: PackType): InvoiceResult {
    const config = this.db.getConfig();
    const priceKey = pack as unknown as string;
    const amount = config.pricePack[priceKey] ?? 0;
    const invoiceId = `pack_${pack}_${Date.now()}`;
    this.db.recordPayment({ userId, type: PaymentType.OneOff, xtrAmount: amount, item: pack });
    const expiresAt = pack === PackType.Memory ? dayjs().add(30, 'day').toDate() : null;
    this.db.addEntitlement(userId, pack, expiresAt);
    return {
      invoiceId,
      mock: true,
      total: amount,
      currency: 'XTR',
      description: `Пакет ${pack}`,
    };
  }

  public refundPayment(paymentId: string): void {
    const payment = this.db.refundPayment(paymentId);
    if (!payment) {
      return;
    }
    if (payment.type === PaymentType.Subscription && payment.tier) {
      this.db.upsertSubscription({ userId: payment.userId, tier: SubscriptionTier.Free });
    }
    if (payment.item === PackType.Memory) {
      this.db.revokeEntitlement(payment.userId, PackType.Memory);
    }
    if (payment.item === PackType.Story) {
      this.db.revokeEntitlement(payment.userId, PackType.Story);
    }
    if (payment.item === PackType.Creator) {
      this.db.revokeEntitlement(payment.userId, PackType.Creator);
    }
  }
}
