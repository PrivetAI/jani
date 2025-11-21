import { startServer } from './server.js';
import { logger } from './logger.js';
import { ensureSchema } from './db/schema.js';
import { startWebhookKeeper } from './services/webhookKeeper.js';

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection', {
    error: reason instanceof Error ? reason.message : String(reason),
  });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', {
    error: error.message,
    stack: error.stack,
  });
});

async function bootstrap() {
  try {
    await ensureSchema();
    await startServer();
    startWebhookKeeper();
  } catch (error) {
    logger.error('Failed to start server', { error: (error as Error).message });
    process.exit(1);
  }
}

bootstrap();
