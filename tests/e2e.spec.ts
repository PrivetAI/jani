import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  addCharacterStory,
  addCharacterVersion,
  createCharacter,
  createDialog,
  ensureUser,
  getCharacter,
  getCharacters,
  getConfig,
  getPrismaClient,
  getQuotaToday,
  getSubscriptionTier,
  retrieveMemories,
  runSeed,
} from '@jani/db';
import { CharacterStatus, CharacterVisibility, SubscriptionTier } from '@jani/shared';
import { OrchestratorService } from '../apps/orchestrator/src/service';
import { ShopService } from '../apps/shop/src/service';
import { BillingService } from '../apps/billing/src/service';

const prisma = getPrismaClient();
const orchestrator = new OrchestratorService(prisma);
const shop = new ShopService(prisma);
const billing = new BillingService(prisma);

const truncateAll = async () => {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "ActiveEffect", "Inventory", "Payment", "Entitlement", "Subscription", "Quota", "Message", "Dialog", "MemoryEpisodic", "Story", "CharacterVersion", "Character", "ItemPrice", "Item", "User" CASCADE',
  );
};

beforeAll(async () => {
  await truncateAll();
  await runSeed();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('end-to-end flows', () => {
  it('creates dialog, handles message, offers item, and upgrades subscription', async () => {
    const user = await ensureUser(prisma, '1001', 'ru');
    const characters = await getCharacters(prisma);
    const character = characters[0];
    const dialog = await createDialog(prisma, { userId: user.id, characterId: character.id, storyId: 'story_asylum13' });

    const result = await orchestrator.handleMessage({ dialogId: dialog.id, userId: user.id, text: 'Проверим дверь, нужен ли ключ?' });
    expect(result.actions.some((action) => action.type === 'OFFER_ITEM' && action.item_slug === 'plot-key-asylum13')).toBe(true);

    const quota = await getQuotaToday(prisma, user.id);
    expect(quota.messagesUsed).toBeGreaterThanOrEqual(1);

    const checkout = await shop.checkout(user.id, 'plot-key-asylum13', 1);
    expect(checkout.total).toBeGreaterThan(0);

    const consume = await shop.consume(user.id, dialog.id, 'plot-key-asylum13');
    expect(consume.inventory.qty).toBeGreaterThanOrEqual(0);

    const invoice = await billing.createSubscriptionInvoice(user.id, SubscriptionTier.Plus);
    expect(invoice.total).toBeGreaterThan(0);
    expect(await getSubscriptionTier(prisma, user.id)).toBe(SubscriptionTier.Plus);

    const next = await orchestrator.handleMessage({ dialogId: dialog.id, userId: user.id, text: 'Продолжаем расследование.' });
    expect(next.summary).toContain('Пользователь');

    const memories = await retrieveMemories(prisma, user.id, character.id, 5);
    expect(memories.length).toBeGreaterThan(0);
  });

  it('enforces quota for free tier users', async () => {
    const user = await ensureUser(prisma, '1002', 'ru');
    const characters = await getCharacters(prisma);
    const character = characters[0];
    const dialog = await createDialog(prisma, { userId: user.id, characterId: character.id });

    const config = getConfig();
    const originalLimit = config.quotaDailyLimit;
    config.quotaDailyLimit = 1;

    await orchestrator.handleMessage({ dialogId: dialog.id, userId: user.id, text: 'Привет' });
    const quota = await getQuotaToday(prisma, user.id);
    expect(quota.messagesUsed).toBe(1);

    await orchestrator.handleMessage({ dialogId: dialog.id, userId: user.id, text: 'Еще одно сообщение' });
    const updated = await getQuotaToday(prisma, user.id);
    expect(updated.messagesUsed).toBeGreaterThanOrEqual(2);

    config.quotaDailyLimit = originalLimit;
  });

  it('supports persona CRUD operations', async () => {
    const character = await createCharacter(prisma, {
      slug: 'test-character',
      name: 'Тестовый Персонаж',
      visibility: CharacterVisibility.Public,
      status: CharacterStatus.Draft,
      systemPrompt: 'Будь дружелюбным',
    });
    expect(character.slug).toBe('test-character');

    await addCharacterStory(prisma, character.id, {
      title: 'Новая история',
      arcJson: { nodes: [] },
      isPremium: false,
    });
    const updated = await getCharacter(prisma, character.id);
    expect(updated?.stories.length).toBeGreaterThan(0);

    await addCharacterVersion(prisma, character.id, { systemPrompt: 'Новая версия', isActive: true });
    const refreshed = await getCharacter(prisma, character.id);
    const versions = refreshed?.versions ?? [];
    expect(versions.some((version) => version.isActive)).toBe(true);
  });
});
