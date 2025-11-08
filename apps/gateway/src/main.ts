import Fastify from 'fastify';
import type { FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { z } from 'zod';
import { getDatabase } from '@jani/db';
import { PackType, SubscriptionTier } from '@jani/shared';
import { TelegramInitDataError, validateTelegramInitData } from '@jani/utils';
import { OrchestratorService } from '../../orchestrator/src/service';
import { BillingService } from '../../billing/src/service';
import { ShopService } from '../../shop/src/service';

const fastify = Fastify({ logger: true });
const db = getDatabase();
const orchestrator = new OrchestratorService(db);
const billing = new BillingService(db);
const shop = new ShopService(db);

fastify.register(cors, { origin: true });
fastify.register(swagger, {
  openapi: {
    info: {
      title: 'Gateway API',
      version: '1.0.0',
      description:
        'API шлюз Mini App. Авторизация через проверенный `initData` Telegram (query/body) либо DEV-заголовки в режиме отладки.',
    },
    components: {
      securitySchemes: {
        TelegramInitData: {
          type: 'apiKey',
          in: 'query',
          name: 'initData',
          description:
            'Подпись Telegram Mini App. Можно передавать как query-параметр `initData` или в JSON-теле запроса.',
        },
        TelegramDevAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'x-telegram-id',
          description: 'DEV-ветка авторизации через мок PWA. Доступно только вне production.',
        },
      },
    },
    security: [{ TelegramInitData: [] }],
  },
});
fastify.register(swaggerUi);

declare module 'fastify' {
  interface FastifyRequest {
    user?: { id: string; tgId: string };
  }
}

const devAuthSchema = z.object({
  tgId: z.string(),
  locale: z.string().optional(),
});

const initDataMaxAgeSecondsRaw = Number(process.env.TELEGRAM_INITDATA_MAX_AGE ?? '86400');
const initDataMaxAgeSeconds = Number.isFinite(initDataMaxAgeSecondsRaw)
  ? initDataMaxAgeSecondsRaw
  : 86400;
const allowDevAuth =
  process.env.GATEWAY_ALLOW_DEV_AUTH === 'true' || process.env.NODE_ENV !== 'production';

function extractInitData(request: FastifyRequest): string | undefined {
  const query = request.query as Record<string, unknown> | undefined;
  const fromQuery = query?.initData ?? query?.init_data;
  if (typeof fromQuery === 'string' && fromQuery.length > 0) {
    return fromQuery;
  }
  const body = request.body as Record<string, unknown> | undefined;
  if (body && typeof body === 'object') {
    const fromBody = body['initData'] ?? body['init_data'];
    if (typeof fromBody === 'string' && fromBody.length > 0) {
      return fromBody;
    }
  }
  return undefined;
}

fastify.addHook('preHandler', async (request, reply) => {
  if (request.routerPath?.startsWith('/docs')) {
    return;
  }
  const initData = extractInitData(request);
  if (initData) {
    const secretKey = process.env.TELEGRAM_WEBAPP_SECRET;
    const botToken = secretKey ? undefined : process.env.TELEGRAM_BOT_TOKEN;

    if (!secretKey && !botToken) {
      request.log.error('Telegram initData secret is not configured');
      reply.code(500).send({ message: 'Telegram initData verification is not configured' });
      return;
    }

    try {
      const validation = validateTelegramInitData(initData, {
        secretKey,
        botToken,
        maxAgeSeconds: initDataMaxAgeSeconds,
      });

      if (!validation.user) {
        reply.code(400).send({ message: 'initData must contain user payload' });
        return;
      }

      const ensured = db.ensureUser(validation.user.id.toString(), validation.user.language_code);
      request.user = { id: ensured.id, tgId: ensured.tgId };
      return;
    } catch (error) {
      if (error instanceof TelegramInitDataError) {
        const status = error.code === 'EXPIRED' ? 401 : 400;
        reply.code(status).send({ message: error.message, code: error.code });
        return;
      }
      request.log.error({ err: error }, 'Unexpected initData validation error');
      reply.code(500).send({ message: 'Unable to verify initData' });
      return;
    }
  }

  if (allowDevAuth) {
    const headers = devAuthSchema.safeParse({
      tgId: request.headers['x-telegram-id'] as string | undefined,
      locale: request.headers['x-user-locale'] as string | undefined,
    });
    if (!headers.success) {
      reply.code(400).send({ message: 'Invalid auth headers' });
      return;
    }
    const user = db.ensureUser(headers.data.tgId, headers.data.locale);
    request.user = { id: user.id, tgId: user.tgId };
    return;
  }

  reply.code(401).send({ message: 'Unauthorized' });
});

fastify.get('/api/characters', async (request, reply) => {
  const visibility = (request.query as { visibility?: string }).visibility;
  const characters = db.getCharacters(visibility);
  return reply.send(characters);
});

fastify.get('/api/characters/:id', async (request, reply) => {
  const id = (request.params as { id: string }).id;
  const character = db.getCharacter(id);
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
  const dialog = db.createDialog({
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
  const quota = db.getQuotaToday(request.user.id);
  const tier = db.getSubscriptionTier(request.user.id);
  const limit = db.getConfig().quotaDailyLimit;
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
  const user = db.getUserById(request.user.id);
  return reply.send({
    subscription_tier: db.getSubscriptionTier(request.user.id),
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
      invoice = billing.createSubscriptionInvoice(request.user.id, body.tier);
      break;
    case 'story':
      invoice = billing.createPackInvoice(request.user.id, PackType.Story);
      break;
    case 'memory':
      invoice = billing.createPackInvoice(request.user.id, PackType.Memory);
      break;
    case 'creator':
      invoice = billing.createPackInvoice(request.user.id, PackType.Creator);
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
  const items = shop.list(request.user.id);
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
  const result = shop.checkout(request.user.id, body.item_slug, body.quantity ?? 1);
  return reply.send(result);
});

fastify.post('/api/shop/consume', async (request, reply) => {
  if (!request.user) {
    return reply.code(401).send({ message: 'Unauthorized' });
  }
  const body = request.body as { dialog_id: string; item_slug: string };
  const result = shop.consume(request.user.id, body.dialog_id, body.item_slug);
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
  const dialog = db.getDialog(dialogId);
  if (!dialog || dialog.userId !== request.user.id) {
    return reply.code(404).send({ message: 'Dialog not found' });
  }
  const quota = db.getQuotaToday(request.user.id);
  const limit = db.getConfig().quotaDailyLimit;
  const tier = db.getSubscriptionTier(request.user.id);
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
