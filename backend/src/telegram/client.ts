import { config } from '../config.js';
import { logger } from '../logger.js';

export interface SendMessagePayload {
  chat_id: number;
  text: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
  reply_markup?: unknown;
}

const apiBase = `https://api.telegram.org/bot${config.telegramBotToken}`;

export const sendTelegramMessage = async (payload: SendMessagePayload) => {
  const url = `${apiBase}/sendMessage`;
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      const errorMessage = `Failed to send Telegram message: ${body || response.status}`;
      logger.error('Telegram sendMessage failed', {
        status: response.status,
        durationMs: Date.now() - startedAt,
        body: body?.slice(0, 1000),
      });
      throw new Error(errorMessage);
    }
    logger.info('Telegram sendMessage ok', {
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    logger.error('Telegram sendMessage network error', {
      error: (error as Error).message,
      stack: (error as Error).stack,
      cause: (error as Error & { cause?: unknown }).cause,
      durationMs: Date.now() - startedAt,
      url,
    });
    throw error;
  }
};
