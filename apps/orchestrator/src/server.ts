import Fastify from 'fastify';
import { getDatabase } from '@jani/db';
import { OrchestratorService } from './service';
import { enqueueMessage, registerWorker } from './queue';

const fastify = Fastify({ logger: true });
const db = getDatabase();
const orchestrator = new OrchestratorService(db);
registerWorker(db);

fastify.post('/orchestrator/handleMessage', async (request, reply) => {
  const body = request.body as { dialog_id: string; user_id: string; text: string };
  const payload = {
    dialogId: body.dialog_id,
    userId: body.user_id,
    text: body.text,
  };
  const asyncResult = await enqueueMessage(payload);
  const result = asyncResult ?? (await orchestrator.handleMessage(payload));
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
