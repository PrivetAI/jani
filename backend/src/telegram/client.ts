import { config } from '../config.js';
import { logger } from '../logger.js';

export interface SendMessagePayload {
  chat_id: number;
  text: string;
  parse_mode?: 'HTML' | 'MarkdownV2';
  reply_markup?: unknown;
}

const apiBase = `https://api.telegram.org/bot${config.telegramBotToken}`;

export const sendTelegramChatAction = async (chatId: number, action: 'typing' | 'upload_photo' | 'record_audio' | 'upload_video' | 'record_video_note' | 'upload_document' | 'find_location' | 'record_voice' | 'upload_voice' | 'choose_contact' | 'choose_sticker' = 'typing') => {
  const url = `${apiBase}/sendChatAction`;
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action }),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error('Telegram sendChatAction failed', {
        status: response.status,
        durationMs: Date.now() - startedAt,
        body: body?.slice(0, 500),
      });
      return;
    }
    logger.info('Telegram sendChatAction ok', {
      durationMs: Date.now() - startedAt,
      action,
    });
  } catch (error) {
    logger.error('Telegram sendChatAction network error', {
      error: (error as Error).message,
      durationMs: Date.now() - startedAt,
      url,
    });
  }
};

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
