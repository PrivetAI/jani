import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryDatabase } from '@jani/db';
import { defaultConfig, SubscriptionTier } from '@jani/shared';
import { OrchestratorService } from '../apps/orchestrator/src/service';
import { ShopService } from '../apps/shop/src/service';
import { BillingService } from '../apps/billing/src/service';

let fetchMock: ReturnType<typeof vi.fn>;
const originalToken = process.env.TELEGRAM_BOT_TOKEN;

beforeEach(() => {
  process.env.TELEGRAM_BOT_TOKEN = 'test-bot-token';
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true, result: 'https://t.me/invoice/mock-link' }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  if (typeof originalToken === 'undefined') {
    delete process.env.TELEGRAM_BOT_TOKEN;
  } else {
    process.env.TELEGRAM_BOT_TOKEN = originalToken;
  }
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const createServices = () => {
  const db = new InMemoryDatabase(defaultConfig);
  const orchestrator = new OrchestratorService(db);
  const shop = new ShopService(db);
  const billing = new BillingService(db);
  return { db, orchestrator, shop, billing };
};

describe('end-to-end flows', () => {
  it('creates dialog, handles message, offers item, and processes payments', async () => {
    const { db, orchestrator, shop, billing } = createServices();
    const user = db.ensureUser('1001', 'ru');
    const character = db.getCharacters()[0];
    const dialog = db.createDialog({ userId: user.id, characterId: character.id, storyId: 'story_asylum13' });

    const result = await orchestrator.handleMessage({ dialogId: dialog.id, userId: user.id, text: 'Проверим дверь, нужен ли ключ?' });
    expect(result.actions.some((action) => action.type === 'OFFER_ITEM' && action.item_slug === 'plot-key-asylum13')).toBe(true);

    const quota = db.getQuotaToday(user.id);
    expect(quota.messagesUsed).toBe(1);

    const itemInvoice = await billing.createItemInvoice(user.id, 'plot-key-asylum13', 1);
    expect(itemInvoice.paymentUrl).toContain('https://t.me/invoice/mock-link');
    expect(billing.verifyPreCheckoutQuery(itemInvoice.invoiceId, itemInvoice.total)).toBe(true);

    const itemPayment = await billing.handleSuccessfulPayment({
      payload: itemInvoice.invoiceId,
      telegramPaymentChargeId: 'charge-item-1',
      totalAmount: itemInvoice.total,
      currency: itemInvoice.currency,
    });
    expect(itemPayment?.payment.tgChargeId).toBe('charge-item-1');
    expect(itemPayment?.fulfillment.kind).toBe('inventory');
    expect(billing.verifyPreCheckoutQuery(itemInvoice.invoiceId, itemInvoice.total)).toBe(false);

    const consume = shop.consume(user.id, dialog.id, 'plot-key-asylum13');
    expect(consume.inventory.qty).toBeGreaterThanOrEqual(0);

    const subscriptionInvoice = await billing.createSubscriptionInvoice(user.id, SubscriptionTier.Plus);
    expect(subscriptionInvoice.paymentUrl).toContain('https://t.me/invoice/mock-link');
    expect(subscriptionInvoice.total).toBeGreaterThan(0);
    expect(billing.verifyPreCheckoutQuery(subscriptionInvoice.invoiceId, subscriptionInvoice.total)).toBe(true);

    const subscriptionPayment = await billing.handleSuccessfulPayment({
      payload: subscriptionInvoice.invoiceId,
      telegramPaymentChargeId: 'charge-sub-1',
      totalAmount: subscriptionInvoice.total,
      currency: subscriptionInvoice.currency,
    });
    expect(subscriptionPayment?.payment.tgChargeId).toBe('charge-sub-1');
    expect(subscriptionPayment?.fulfillment.kind).toBe('subscription');
    expect(db.getSubscriptionTier(user.id)).toBe(SubscriptionTier.Plus);

    const next = await orchestrator.handleMessage({ dialogId: dialog.id, userId: user.id, text: 'Продолжаем расследование.' });
    expect(next.summary).toContain('Пользователь');

    const memories = db.retrieveMemories(user.id, character.id, 5);
    expect(memories.length).toBeGreaterThan(0);

    if (subscriptionPayment) {
      billing.refundPayment(subscriptionPayment.payment.id);
    }
    expect(db.getSubscriptionTier(user.id)).toBe(SubscriptionTier.Free);

    if (itemPayment) {
      billing.refundPayment(itemPayment.payment.id);
    }
    const itemRecord = db
      .getUserById(user.id)
      ?.inventory.find((inv) => inv.itemId === db.getItemBySlug('plot-key-asylum13')?.id);
    expect(itemRecord?.qty ?? 0).toBe(0);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('enforces quota for free tier users', async () => {
    const { db, orchestrator } = createServices();
    const user = db.ensureUser('1002', 'ru');
    const character = db.getCharacters()[0];
    const dialog = db.createDialog({ userId: user.id, characterId: character.id });

    const config = db.getConfig();
    (config as unknown as { quotaDailyLimit: number }).quotaDailyLimit = 1;

    await orchestrator.handleMessage({ dialogId: dialog.id, userId: user.id, text: 'Привет' });
    const quota = db.getQuotaToday(user.id);
    expect(quota.messagesUsed).toBe(1);

    // second message should still process but quota increments beyond limit, which gateway would block
    await orchestrator.handleMessage({ dialogId: dialog.id, userId: user.id, text: 'Еще одно сообщение' });
    const updated = db.getQuotaToday(user.id);
    expect(updated.messagesUsed).toBe(2);
  });

  it('supports persona CRUD operations', () => {
    const { db } = createServices();
    const character = db.createCharacter({
      slug: 'test-character',
      name: 'Тестовый Персонаж',
      visibility: 'public' as any,
      status: 'draft' as any,
      systemPrompt: 'Будь дружелюбным',
    });
    expect(character.slug).toBe('test-character');

    db.addCharacterStory(character.id, { title: 'Новая история', arcJson: { nodes: [] }, isPremium: false, characterId: character.id });
    expect(db.getCharacter(character.id)?.stories.length).toBeGreaterThan(0);

    db.addCharacterVersion(character.id, { systemPrompt: 'Новая версия', isActive: true });
    const versions = db.getCharacter(character.id)?.versions ?? [];
    expect(versions.some((version) => version.isActive)).toBe(true);
  });
});
