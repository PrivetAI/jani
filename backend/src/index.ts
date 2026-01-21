import { startServer } from './server.js';
import { logger, sendLogToTelegram } from './logger.js';
import { ensureSchema } from './db/schema.js';
import { startWebhookKeeper } from './services/webhookKeeper.js';
import { config } from './config.js';

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

// Schedule daily log send at 00:05 (5 min after midnight to ensure day is complete)
const scheduleLogSend = () => {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(0, 5, 0, 0); // 00:05
  nextMidnight.setDate(nextMidnight.getDate() + 1);

  const msUntilMidnight = nextMidnight.getTime() - now.getTime();

  logger.info(`Log sender scheduled for ${nextMidnight.toISOString()}`);

  setTimeout(async () => {
    if (config.backupChatId) {
      await sendLogToTelegram(config.telegramBotToken, config.backupChatId);
    } else {
      logger.warn('BACKUP_CHAT_ID not set, skipping log send');
    }
    // Reschedule for next day
    scheduleLogSend();
  }, msUntilMidnight);
};

async function bootstrap() {
  try {
    await ensureSchema();
    await startServer();
    startWebhookKeeper();

    // Start log scheduler if BACKUP_CHAT_ID is configured
    if (config.backupChatId) {
      scheduleLogSend();
    }
  } catch (error) {
    logger.error('Failed to start server', { error: (error as Error).message });
    process.exit(1);
  }
}

bootstrap();
