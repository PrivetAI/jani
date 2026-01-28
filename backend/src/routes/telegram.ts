import { Router } from 'express';
import { config } from '../config.js';
import { findOrCreateUser, updateLastCharacter, getCharacterById, createSubscription } from '../modules/index.js';
import { recordPayment } from '../repositories/paymentsRepository.js';
import { sendTelegramMessage } from '../telegram/client.js';
import { buildWebAppButton } from '../telegram/helpers.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logger } from '../logger.js';
import { answerPreCheckoutQuery, parseInvoicePayload, SUBSCRIPTION_TIERS } from '../services/paymentService.js';
import { notifyAdminPaymentSuccess, notifyAdminPaymentFailed } from '../services/telegramNotifier.js';

interface TelegramMessage {
  message_id: number;
  from: { id: number; username?: string };
  chat: { id: number };
  text?: string;
  successful_payment?: SuccessfulPayment;
}

interface SuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
}

interface PreCheckoutQuery {
  id: string;
  from: { id: number; username?: string };
  currency: string;
  total_amount: number;
  invoice_payload: string;
}

interface TelegramUpdate {
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
  pre_checkout_query?: PreCheckoutQuery;
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

/**
 * Handle pre_checkout_query - MUST respond within 10 seconds
 */
const handlePreCheckoutQuery = async (query: PreCheckoutQuery) => {
  logger.info('Pre-checkout query received', {
    queryId: query.id,
    fromId: query.from.id,
    amount: query.total_amount,
    currency: query.currency,
  });

  const payload = parseInvoicePayload(query.invoice_payload);

  if (!payload) {
    logger.warn('Invalid invoice payload', { payload: query.invoice_payload });
    await answerPreCheckoutQuery(query.id, false, 'Некорректные данные платежа');
    return;
  }

  // Validate that user exists
  const user = await findOrCreateUser({ id: query.from.id, username: query.from.username });
  if (user.id !== payload.userId) {
    logger.warn('User ID mismatch in pre_checkout', { payloadUserId: payload.userId, actualUserId: user.id });
  }

  // Accept the payment
  await answerPreCheckoutQuery(query.id, true);
  logger.info('Pre-checkout query approved', { queryId: query.id, userId: user.id, tier: payload.tier });
};

/**
 * Handle successful payment - create subscription
 */
const handleSuccessfulPayment = async (message: TelegramMessage) => {
  const payment = message.successful_payment!;

  logger.info('Successful payment received', {
    fromId: message.from.id,
    amount: payment.total_amount,
    currency: payment.currency,
    chargeId: payment.telegram_payment_charge_id,
  });

  const payload = parseInvoicePayload(payment.invoice_payload);

  if (!payload) {
    logger.error('Invalid payload in successful payment', { payload: payment.invoice_payload });
    await notifyAdminPaymentFailed({
      telegramUserId: message.from.id,
      username: message.from.username,
      reason: 'Невалидный payload в успешном платеже',
      payload: payment.invoice_payload,
    });
    return;
  }

  const tierConfig = SUBSCRIPTION_TIERS[payload.tier];
  const user = await findOrCreateUser({ id: message.from.id, username: message.from.username });

  // Record payment with charge_id for potential refunds
  await recordPayment(
    user.id,
    payment.total_amount,
    'success',
    payment.telegram_payment_charge_id
  );

  // Create subscription
  const subscription = await createSubscription(user.id, tierConfig.days);

  logger.info('Subscription created after payment', {
    userId: user.id,
    tier: payload.tier,
    days: tierConfig.days,
    endAt: subscription.end_at,
    chargeId: payment.telegram_payment_charge_id,
  });

  // Notify admins about successful payment 💰
  await notifyAdminPaymentSuccess({
    telegramUserId: message.from.id,
    username: message.from.username,
    tier: payload.tier,
    tierLabel: tierConfig.label,
    stars: tierConfig.stars,
    days: tierConfig.days,
    chargeId: payment.telegram_payment_charge_id,
  });

  // Notify user
  await sendTelegramMessage({
    chat_id: message.chat.id,
    text: `✅ Оплата прошла успешно!

🌟 <b>${tierConfig.label}</b> активирован

Действует до: <b>${new Date(subscription.end_at).toLocaleDateString('ru-RU')}</b>

Спасибо за поддержку! Теперь у тебя безлимитные сообщения и доступ ко всем премиум-персонажам.`,
    reply_markup: openAppKeyboard(),
    parse_mode: 'HTML',
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

    const update = req.body as TelegramUpdate;

    // Handle pre_checkout_query (payment confirmation) - MUST respond quickly
    if (update.pre_checkout_query) {
      await handlePreCheckoutQuery(update.pre_checkout_query);
      return res.json({ ok: true });
    }

    const message = update.message ?? update.edited_message;

    // Handle successful payment
    if (message?.successful_payment) {
      await handleSuccessfulPayment(message);
      return res.json({ ok: true });
    }

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

