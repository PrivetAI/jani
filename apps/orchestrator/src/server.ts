import Fastify from 'fastify';
import { getPrismaClient } from '@jani/db';
import { OrchestratorService } from './service';

const fastify = Fastify({ logger: true });
const prisma = getPrismaClient();
const orchestrator = new OrchestratorService(prisma);

fastify.post('/orchestrator/handleMessage', async (request, reply) => {
  const body = request.body as { dialog_id: string; user_id: string; text: string };
  const result = await orchestrator.handleMessage({
    dialogId: body.dialog_id,
    userId: body.user_id,
    text: body.text,
  });
  return reply.send({
    user_visible_text: result.userVisibleText,
    actions: result.actions,
    summary: result.summary,
  });
});

fastify.post('/orchestrator/cancel', async (request, reply) => {
  const body = request.body as { dialog_id: string };
  await orchestrator.cancel(body.dialog_id);
  return reply.send({ status: 'ok' });
});

fastify.listen({ port: 3010, host: '0.0.0.0' }).catch((error) => {
  fastify.log.error(error);
  process.exit(1);
});
