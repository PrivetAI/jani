import Fastify from 'fastify';
import { getDatabase } from '@jani/db';
import { ShopService } from './service';

const fastify = Fastify({ logger: true });
const db = getDatabase();
const shop = new ShopService(db);

fastify.get('/shop/items', async (request, reply) => {
  const userId = (request.headers['x-user-id'] as string) ?? '';
  const items = shop.list(userId);
  return reply.send(items);
});

fastify.post('/shop/checkout', async (request, reply) => {
  const body = request.body as { user_id: string; item_slug: string; quantity?: number };
  const result = shop.checkout(body.user_id, body.item_slug, body.quantity ?? 1);
  return reply.send(result);
});

fastify.post('/shop/consume', async (request, reply) => {
  const body = request.body as { user_id: string; dialog_id: string; item_slug: string };
  const result = shop.consume(body.user_id, body.dialog_id, body.item_slug);
  return reply.send(result);
});

fastify.listen({ port: 3030, host: '0.0.0.0' }).catch((error) => {
  fastify.log.error(error);
  process.exit(1);
});
