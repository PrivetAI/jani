import { Router } from 'express';
import { config } from '../config.js';
import { findOrCreateUser, updateLastCharacter, getCharacterById } from '../modules/index.js';
import { sendTelegramMessage } from '../telegram/client.js';
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
    text: `Открой приложение ниже, чтобы выбрать персонажа и начать переписку\\.

Также вступай в наше [сообщество](https://t.me/+GdEl83m8Bn8wNGNi)\\. Мы разрабатываем персонажей по запросам\\. Быстро реагируем на ошибки и раздаем промокоды\\.

Написать свой отзыв команде разработке: @Olegceocash`,
    reply_markup: openAppKeyboard(),
    parse_mode: 'MarkdownV2',
  });
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
    } else {
      // Все остальные сообщения игнорируем - общение происходит только в мини-приложении
      logger.info('Telegram webhook ignored (mini-app only mode)', {
        messageId: message?.message_id,
        textPreview: message?.text?.slice(0, 50),
      });
    }

    res.json({ ok: true });
  })
);

export const telegramRouter = router;
