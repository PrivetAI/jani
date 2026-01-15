import { Router } from 'express';
import { config } from '../config.js';
import { findOrCreateUser, updateLastCharacter, getCharacterById } from '../modules/index.js';
import { chatSessionService } from '../services/chatSessionService.js';
import {
  CharacterInactiveError,
  CharacterRequiredError,
  LimitReachedError,
  LLMGenerationError,
  PremiumRequiredError,
} from '../errors.js';
import { sendTelegramChatAction, sendTelegramMessage } from '../telegram/client.js';
import { buildWebAppButton } from '../telegram/helpers.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../logger.js';

interface TelegramMessage {
  message_id: number;
  from: { id: number; username?: string };
  chat: { id: number };
  text?: string;
}

const router = Router();

const limitKeyboard = () => buildWebAppButton('Оформить подписку', '/subscription');
const openAppKeyboard = () => buildWebAppButton('Открыть приложение');

router.use((req, _res, next) => {
  logger.info('Telegram webhook hit', {
    method: req.method,
    path: req.path,
    ip: req.ip,
    hasSecretHeader: Boolean(req.header('x-telegram-bot-api-secret-token')),
    contentType: req.header('content-type'),
    contentLength: req.header('content-length'),
  });
  next();
});

const handleStartCommand = async (message: TelegramMessage, payload: string | null) => {
  const user = await findOrCreateUser({ id: message.from.id, username: message.from.username });
  if (payload) {
    const id = Number(payload);
    const character = await getCharacterById(id);
    if (character) {
      await updateLastCharacter(user.id, character.id);
      await sendTelegramMessage({
        chat_id: message.chat.id,
        text: `Персонаж «${character.name}» выбран. Напиши мне любое сообщение, чтобы начать.`,
      });
      return;
    }
  }

  await sendTelegramMessage({
    chat_id: message.chat.id,
    text: `Открой приложение ниже, чтобы выбрать персонажа и начать переписку.

Также вступай в наше сообщество (https://t.me/+GdEl83m8Bn8wNGNi). Мы разрабатываем персонажей по запросам. Быстро реагируем на ошибки и раздаем промокоды.

Написать свой отзыв команде разработке: @Olegceocash`,
    reply_markup: openAppKeyboard(),
  });
};

const handleUserText = async (message: TelegramMessage) => {
  if (!message.text) {
    return;
  }
  try {
    // Показываем typing, чтобы имитировать живой набор перед генерацией.
    await sendTelegramChatAction(message.chat.id, 'typing');
    const result = await chatSessionService.processMessage({
      telegramUserId: message.from.id,
      username: message.from.username,
      messageText: message.text,
    });
    await sendTelegramMessage({ chat_id: message.chat.id, text: result.reply });
  } catch (error) {
    if (error instanceof CharacterRequiredError) {
      await sendTelegramMessage({
        chat_id: message.chat.id,
        text: 'Сначала выберите персонажа в мини-приложении.',
        reply_markup: openAppKeyboard(),
      });
      return;
    }
    if (error instanceof CharacterInactiveError) {
      await sendTelegramMessage({
        chat_id: message.chat.id,
        text: 'Этот персонаж недоступен. Выберите другого в мини-приложении.',
        reply_markup: openAppKeyboard(),
      });
      return;
    }
    if (error instanceof PremiumRequiredError) {
      await sendTelegramMessage({
        chat_id: message.chat.id,
        text: 'Это премиум-персонаж. Оформите подписку, чтобы продолжить.',
        reply_markup: limitKeyboard(),
      });
      return;
    }
    if (error instanceof LimitReachedError) {
      await sendTelegramMessage({
        chat_id: message.chat.id,
        text: `Лимит ${config.freeDailyMessageLimit} сообщений на сегодня исчерпан. Подпишитесь, чтобы продолжить.`,
        reply_markup: limitKeyboard(),
      });
      return;
    }
    logger.error('LLM error', { error: (error as Error).message });
    if (error instanceof LLMGenerationError) {
      await sendTelegramMessage({
        chat_id: message.chat.id,
        text: 'Сейчас сервера отвечают слишком долго. Попробуйте повторить сообщение позже.',
      });
      return;
    }
    throw error;
  }
};

router.post(
  '/',
  asyncHandler(async (req, res) => {
    const secret = req.header('x-telegram-bot-api-secret-token');
    logger.info('Telegram webhook received', {
      hasSecret: Boolean(secret),
      secretMatch: secret === config.telegramWebhookSecret,
      updateKeys: Object.keys(req.body ?? {}),
    });
    if (secret !== config.telegramWebhookSecret) {
      return res.status(403).json({ ok: true });
    }

    const update = req.body as { message?: TelegramMessage; edited_message?: TelegramMessage };
    const message = update.message ?? update.edited_message;
    if (message) {
      logger.info('Telegram webhook', {
        messageId: message.message_id,
        fromId: message.from.id,
        username: message.from.username,
        textPreview: message.text?.slice(0, 120) ?? null,
        isEdited: Boolean(update.edited_message),
      });
    }
    if (message?.text?.startsWith('/start')) {
      const [, payload] = message.text.split(' ');
      await handleStartCommand(message, payload ?? null);
    } else if (message?.text) {
      await handleUserText(message);
    } else {
      logger.info('Telegram webhook ignored update (no text)', {
        messageId: message?.message_id,
        hasText: Boolean(message?.text),
      });
    }

    res.json({ ok: true });
  })
);

export const telegramRouter = router;
