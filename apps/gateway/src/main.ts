import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { z } from 'zod';
import {
  createDialog,
  ensureUser,
  getCharacter,
  getCharacters,
  getConfig,
  getDialog,
  getPrismaClient,
  getQuotaToday,
  getSubscriptionTier,
  getUserById,
} from '@jani/db';
import { PackType, SubscriptionTier } from '@jani/shared';
import { OrchestratorService } from '../../orchestrator/src/service';
import { BillingService } from '../../billing/src/service';
import { ShopService } from '../../shop/src/service';

const fastify = Fastify({ logger: true });
const prisma = getPrismaClient();
const orchestrator = new OrchestratorService(prisma);
const billing = new BillingService(prisma);
const shop = new ShopService(prisma);
const config = getConfig();

fastify.register(cors, { origin: true });
fastify.register(swagger, {
  openapi: {
    info: {
      title: 'Gateway API',
      version: '1.0.0',
    },
  },
});
fastify.register(swaggerUi);

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; tgId: string };
  }
}

const authSchema = z.object({
  tgId: z.string().default('demo-user'),
  locale: z.string().optional(),
});

fastify.addHook('preHandler', async (request, reply) => {
  if (request.routerPath?.startsWith('/docs')) {
    return;
  }
  const headers = authSchema.safeParse({
    tgId: (request.headers['x-telegram-id'] as string) ?? 'demo-user',
    locale: request.headers['x-user-locale'] as string | undefined,
  });
  if (!headers.success) {
    reply.code(400).send({ message: 'Invalid auth headers' });
    return;
  }
  const user = await ensureUser(prisma, headers.data.tgId, headers.data.locale);
  request.user = { id: user.id, tgId: user.tgId };
});

fastify.get('/api/characters', async (request, reply) => {
  const visibility = (request.query as { visibility?: string }).visibility;
  const characters = await getCharacters(prisma, visibility);
  return reply.send(characters);
});

fastify.get('/api/characters/:id', async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const character = await getCharacter(prisma, id);
  if (!character) {
    return reply.code(404).send({ message: 'Character not found' });
  }
  return reply.send(character);
});

fastify.post('/api/dialogs', async (request, reply) => {
  const body = request.body as { character_id: string; story_id?: string };
  if (!request.user) {
    return reply.code(401).send({ message: 'Unauthorized' });
  }
  const dialog = await createDialog(prisma, {
    userId: request.user.id,
    characterId: body.character_id,
    storyId: body.story_id,
  });
  const deeplink = `https://t.me/share/url?url=dialog:${dialog.id}`;
  return reply.code(201).send({ dialog_id: dialog.id, deeplink });
});

fastify.get('/api/quotas/today', async (request, reply) => {
  if (!request.user) {
    return reply.code(401).send({ message: 'Unauthorized' });
  }
  const quota = await getQuotaToday(prisma, request.user.id);
  const tier = await getSubscriptionTier(prisma, request.user.id);
  const limit = config.quotaDailyLimit;
  const isUnlimited = tier !== SubscriptionTier.Free;
  return reply.send({
    remaining: isUnlimited ? null : Math.max(0, limit - quota.messagesUsed),
    limit,
    is_unlimited: isUnlimited,
  });
});

fastify.get('/api/entitlements', async (request, reply) => {
  if (!request.user) {
    return reply.code(401).send({ message: 'Unauthorized' });
  }
  const user = await getUserById(prisma, request.user.id);
  return reply.send({
    subscription_tier: await getSubscriptionTier(prisma, request.user.id),
    packs: user?.entitlements ?? [],
  });
});

fastify.post('/api/payments/invoice', async (request, reply) => {
  if (!request.user) {
    return reply.code(401).send({ message: 'Unauthorized' });
  }
  const body = request.body as { item: 'subscription' | 'story' | 'memory' | 'creator'; tier?: SubscriptionTier };
  let invoice;
  switch (body.item) {
    case 'subscription':
      if (!body.tier || body.tier === SubscriptionTier.Free) {
        return reply.code(400).send({ message: 'tier required' });
      }
      invoice = await billing.createSubscriptionInvoice(request.user.id, body.tier);
      break;
    case 'story':
      invoice = await billing.createPackInvoice(request.user.id, PackType.Story);
      break;
    case 'memory':
      invoice = await billing.createPackInvoice(request.user.id, PackType.Memory);
      break;
    case 'creator':
      invoice = await billing.createPackInvoice(request.user.id, PackType.Creator);
      break;
    default:
      return reply.code(400).send({ message: 'Invalid item' });
  }
  return reply.send({ invoice_id: invoice.invoiceId, mock: invoice.mock, total: invoice.total });
});

fastify.get('/api/shop/items', async (request, reply) => {
  if (!request.user) {
    return reply.code(401).send({ message: 'Unauthorized' });
  }
  const items = await shop.list(request.user.id);
  const formatted = items.map((entry) => ({
    slug: entry.item.slug,
    title_ru: entry.item.titleRu,
    description_ru: entry.item.descriptionRu,
    category: entry.item.category,
    rarity: entry.item.rarity,
    effect: entry.item.effect,
    prices: entry.item.prices,
    owned_qty: entry.ownedQty,
    discounts: entry.discounts,
  }));
  return reply.send(formatted);
});

fastify.post('/api/shop/checkout', async (request, reply) => {
  if (!request.user) {
    return reply.code(401).send({ message: 'Unauthorized' });
  }
  const body = request.body as { item_slug: string; quantity?: number };
  const result = await shop.checkout(request.user.id, body.item_slug, body.quantity ?? 1);
  return reply.send(result);
});

fastify.post('/api/shop/consume', async (request, reply) => {
  if (!request.user) {
    return reply.code(401).send({ message: 'Unauthorized' });
  }
  const body = request.body as { dialog_id: string; item_slug: string };
  const result = await shop.consume(request.user.id, body.dialog_id, body.item_slug);
  return reply.send({
    applied_effects: [result.effect],
    inventory: result.inventory,
  });
});

fastify.post('/api/dialogs/:id/messages', async (request, reply) => {
  if (!request.user) {
    return reply.code(401).send({ message: 'Unauthorized' });
  }
  const dialogId = (request.params as { id: string }).id;
  const body = request.body as { text: string };
  const dialog = await getDialog(prisma, dialogId);
  if (!dialog || dialog.userId !== request.user.id) {
    return reply.code(404).send({ message: 'Dialog not found' });
  }
  const quota = await getQuotaToday(prisma, request.user.id);
  const limit = config.quotaDailyLimit;
  const tier = await getSubscriptionTier(prisma, request.user.id);
  if (tier === SubscriptionTier.Free && quota.messagesUsed >= limit) {
    return reply.code(429).send({
      message: 'Дневной лимит сообщений исчерпан. Оформить подписку, чтобы снять ограничения?',
    });
  }
  const result = await orchestrator.handleMessage({ dialogId, userId: request.user.id, text: body.text });
  return reply.send({
    user_visible_text: result.userVisibleText,
    actions: result.actions,
    summary: result.summary,
  });
});

fastify.listen({ port: 3000, host: '0.0.0.0' }).catch((error) => {
  fastify.log.error(error);
  process.exit(1);
});
