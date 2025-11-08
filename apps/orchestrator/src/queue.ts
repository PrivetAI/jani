import { Queue, Worker, JobsOptions } from 'bullmq';
import IORedis from 'ioredis';
import { diag } from '@opentelemetry/api';
import { InMemoryDatabase } from '@jani/db';
import { OrchestratorHandleMessageInput, OrchestratorHandleMessageResult } from '@jani/shared';
import { OrchestratorService } from './service';

export type MessageJobData = OrchestratorHandleMessageInput;
export type MessageJobResult = OrchestratorHandleMessageResult;

const queueName = 'orchestrator:messages';

const createConnection = (): IORedis | null => {
  const url = process.env.REDIS_URL;
  if (!url) {
    return null;
  }
  try {
    return new IORedis(url, { maxRetriesPerRequest: 2 });
  } catch (error) {
    diag.error('Failed to connect to Redis', error);
    return null;
  }
};

const connection = createConnection();

export const messageQueue = connection
  ? new Queue<MessageJobData, MessageJobResult>(queueName, { connection })
  : null;

export const enqueueMessage = async (
  data: MessageJobData,
  options?: JobsOptions,
): Promise<MessageJobResult | null> => {
  if (!messageQueue) {
    return null;
  }
  const job = await messageQueue.add('handle', data, options);
  return job.waitUntilFinished();
};

export const registerWorker = (db: InMemoryDatabase, concurrency = 1): Worker<MessageJobData, MessageJobResult> | null => {
  if (!connection) {
    return null;
  }
  const service = new OrchestratorService(db);
  const worker = new Worker<MessageJobData, MessageJobResult>(
    queueName,
    async (job) => service.processMessage(job.data),
    { connection, concurrency },
  );
  worker.on('failed', (job, err) => {
    diag.error('Message job failed', { jobId: job?.id, err });
  });
  return worker;
};
