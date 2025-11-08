import Fastify from 'fastify';
import { getDatabase } from '@jani/db';
import { BillingService } from './service';
import { PackType, SubscriptionTier } from '@jani/shared';

const fastify = Fastify({ logger: true });
const db = getDatabase();
const billing = new BillingService(db);

fastify.post('/billing/invoice/subscription', async (request, reply) => {
  const body = request.body as { user_id: string; tier: SubscriptionTier };
  const invoice = await billing.createSubscriptionInvoice(body.user_id, body.tier);
  return reply.send(invoice);
});

fastify.post('/billing/invoice/pack', async (request, reply) => {
  const body = request.body as { user_id: string; pack: PackType };
  const invoice = await billing.createPackInvoice(body.user_id, body.pack);
  return reply.send(invoice);
});

fastify.post('/billing/refund', async (request, reply) => {
  const body = request.body as { payment_id: string };
  billing.refundPayment(body.payment_id);
  return reply.send({ status: 'refunded' });
});

fastify.listen({ port: 3020, host: '0.0.0.0' }).catch((error) => {
  fastify.log.error(error);
  process.exit(1);
});
