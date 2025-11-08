import dayjs from 'dayjs';
import { PackType, PaymentStatus, PaymentType, SubscriptionTier } from '@jani/shared';
import { PrismaClient, SubscriptionStatus } from '@prisma/client';
import { getPrismaClient } from '@jani/db';
import { defaultConfig } from '@jani/shared';

export interface InvoiceResult {
  invoiceId: string;
  mock: boolean;
  total: number;
  currency: string;
  description: string;
}

export class BillingService {
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? getPrismaClient();
  }

  public async createSubscriptionInvoice(userId: string, tier: SubscriptionTier): Promise<InvoiceResult> {
    const amount = defaultConfig.priceSubscription[tier];
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          userId,
          type: PaymentType.Subscription,
          xtrAmount: amount,
          tier,
          status: PaymentStatus.Paid,
        },
      });
      const existing = await tx.subscription.findFirst({ where: { userId, status: SubscriptionStatus.active } });
      const renewsAt = dayjs(now).add(defaultConfig.subscriptionPeriodSeconds, 'second').toDate();
      if (existing) {
        await tx.subscription.update({
          where: { id: existing.id },
          data: {
            tier,
            startedAt: now,
            renewsAt,
            status: SubscriptionStatus.active,
          },
        });
      } else {
        await tx.subscription.create({
          data: {
            userId,
            tier,
            startedAt: now,
            renewsAt,
            status: SubscriptionStatus.active,
          },
        });
      }
    });
    return {
      invoiceId: `sub_${tier}_${Date.now()}`,
      mock: true,
      total: amount,
      currency: 'XTR',
      description: `Подписка ${tier}`,
    };
  }

  public async createPackInvoice(userId: string, pack: PackType): Promise<InvoiceResult> {
    const amount = defaultConfig.pricePack[pack as keyof typeof defaultConfig.pricePack] ?? 0;
    await this.prisma.$transaction(async (tx) => {
      await tx.payment.create({
        data: {
          userId,
          type: PaymentType.OneOff,
          xtrAmount: amount,
          item: pack,
          status: PaymentStatus.Paid,
        },
      });
      const expiresAt = pack === PackType.Memory ? dayjs().add(30, 'day').toDate() : null;
      await tx.entitlement.create({
        data: {
          userId,
          pack,
          expiresAt,
        },
      });
    });
    return {
      invoiceId: `pack_${pack}_${Date.now()}`,
      mock: true,
      total: amount,
      currency: 'XTR',
      description: `Пакет ${pack}`,
    };
  }

  public async refundPayment(paymentId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.update({
        where: { id: paymentId },
        data: { status: 'refunded' },
      });
      if (payment.type === PaymentType.Subscription && payment.tier) {
        const now = new Date();
        const renewsAt = dayjs(now).add(defaultConfig.subscriptionPeriodSeconds, 'second').toDate();
        await tx.subscription.updateMany({
          where: { userId: payment.userId },
          data: { status: SubscriptionStatus.canceled },
        });
        await tx.subscription.create({
          data: {
            userId: payment.userId,
            tier: SubscriptionTier.Free,
            startedAt: now,
            renewsAt,
            status: SubscriptionStatus.active,
          },
        });
      }
      if (payment.item === PackType.Memory) {
        await tx.entitlement.deleteMany({ where: { userId: payment.userId, pack: PackType.Memory } });
      }
      if (payment.item === PackType.Story) {
        await tx.entitlement.deleteMany({ where: { userId: payment.userId, pack: PackType.Story } });
      }
      if (payment.item === PackType.Creator) {
        await tx.entitlement.deleteMany({ where: { userId: payment.userId, pack: PackType.Creator } });
      }
    });
  }
}
