import Fastify from 'fastify';
import { getPrismaClient } from '@jani/db';
import { ShopService } from './service';

const fastify = Fastify({ logger: true });
const prisma = getPrismaClient();
const shop = new ShopService(prisma);

fastify.get('/shop/items', async (request, reply) => {
  const userId = (request.headers['x-user-id'] as string) ?? '';
  const items = await shop.list(userId);
  return reply.send(items);
});

fastify.post('/shop/checkout', async (request, reply) => {
  const body = request.body as { user_id: string; item_slug: string; quantity?: number };
  const result = await shop.checkout(body.user_id, body.item_slug, body.quantity ?? 1);
  return reply.send(result);
});

fastify.post('/shop/consume', async (request, reply) => {
  const body = request.body as { user_id: string; dialog_id: string; item_slug: string };
  const result = await shop.consume(body.user_id, body.dialog_id, body.item_slug);
  return reply.send(result);
});

fastify.listen({ port: 3030, host: '0.0.0.0' }).catch((error) => {
  fastify.log.error(error);
  process.exit(1);
});
