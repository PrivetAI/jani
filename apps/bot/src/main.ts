import { Bot, InlineKeyboard } from 'grammy';
import { run } from '@grammyjs/runner';
import { getDatabase } from '@jani/db';
import { OrchestratorService } from '../../orchestrator/src/service';
import { BillingService } from '../../billing/src/service';
import { DialogStatus, SubscriptionTier } from '@jani/shared';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Bot will not start.');
  process.exit(1);
}

const db = getDatabase();
const orchestrator = new OrchestratorService(db);
const billing = new BillingService(db);

const bot = new Bot(token);

const ensureDialog = (userId: string) => {
  const user = db.getUserById(userId);
  const existing = user?.dialogs.find((dialog) => dialog.status === DialogStatus.Open);
  if (existing) {
    return existing;
  }
  const defaultCharacter = db.getCharacters().find((char) => char.slug === 'arina-archivist') ?? db.getCharacters()[0];
  return db.createDialog({ userId, characterId: defaultCharacter.id, storyId: defaultCharacter.stories[0]?.id });
};

const getItemPrice = (userId: string, itemSlug: string): number | null => {
  const item = db.getItemBySlug(itemSlug);
  if (!item) {
    return null;
  }
  const price = item.prices[0];
  if (!price) {
    return null;
  }
  const tier = db.getSubscriptionTier(userId);
  const discount = price.tierDiscount?.[tier] ?? 0;
  return Math.max(1, Math.round(price.xtrAmount * (1 - discount / 100)));
};

bot.command('start', async (ctx) => {
  await ctx.reply('Привет! Я готов продолжить расследование. Просто напиши сообщение.');
});

bot.on('message:text', async (ctx) => {
  const from = ctx.from;
  if (!from) {
    return;
  }
  const user = db.ensureUser(from.id.toString(), from.language_code);
  const dialog = ensureDialog(user.id);
  const quota = db.getQuotaToday(user.id);
  const limit = db.getConfig().quotaDailyLimit;
  const tier = db.getSubscriptionTier(user.id);
  if (tier === SubscriptionTier.Free && quota.messagesUsed >= limit) {
    await ctx.reply('Лимит: Дневной лимит сообщений исчерпан. Оформить подписку, чтобы снять ограничения?');
    return;
  }
  const result = await orchestrator.handleMessage({ dialogId: dialog.id, userId: user.id, text: ctx.message.text });
  let keyboard: InlineKeyboard | undefined;
  const offer = result.actions.find((action) => action.type === 'OFFER_ITEM');
  if (offer && offer.type === 'OFFER_ITEM') {
    const price = getItemPrice(user.id, offer.item_slug);
    const label = typeof price === 'number' ? `Купить за ★${price}` : 'Купить предмет';
    keyboard = new InlineKeyboard().text(label, `buy:${offer.item_slug}:${dialog.id}`);
    await ctx.reply(offer.reason_ru ?? 'Доступен новый предмет.', { reply_markup: keyboard });
  }
  await ctx.reply(result.userVisibleText);
});

bot.on('callback_query:data', async (ctx) => {
  const data = ctx.callbackQuery.data;
  if (!data?.startsWith('buy:')) {
    await ctx.answerCallbackQuery();
    return;
  }
  const [, itemSlug, dialogId] = data.split(':');
  const from = ctx.from;
  const chat = ctx.chat;
  if (!from || !chat) {
    await ctx.answerCallbackQuery({ text: 'Ошибка. Попробуйте позже.', show_alert: true });
    return;
  }
  const user = db.ensureUser(from.id.toString(), from.language_code);
  try {
    await billing.createItemInvoice(user.id, itemSlug, 1, { createLink: false, sendToChatId: chat.id }, dialogId);
    await ctx.answerCallbackQuery({ text: 'Счет отправлен' });
  } catch (error) {
    console.error('Failed to create invoice', error);
    await ctx.answerCallbackQuery({ text: 'Не удалось выставить счет', show_alert: true });
  }
});

bot.on('pre_checkout_query', async (ctx) => {
  const payload = ctx.preCheckoutQuery.invoice_payload;
  const totalAmount = ctx.preCheckoutQuery.total_amount;
  const isValid = billing.verifyPreCheckoutQuery(payload, totalAmount);
  if (isValid) {
    await ctx.answerPreCheckoutQuery(true);
    return;
  }
  await ctx.answerPreCheckoutQuery(false, { error_message: 'Счет не найден или устарел. Попробуйте снова.' });
});

bot.on('message:successful_payment', async (ctx) => {
  const payment = ctx.message?.successful_payment;
  const from = ctx.from;
  if (!payment || !from) {
    return;
  }
  const user = db.ensureUser(from.id.toString(), from.language_code);
  try {
    const result = await billing.handleSuccessfulPayment({
      payload: payment.invoice_payload,
      telegramPaymentChargeId: payment.telegram_payment_charge_id,
      totalAmount: payment.total_amount,
      currency: payment.currency,
    });
    if (!result) {
      await ctx.reply('Не удалось найти счет. Если списание произошло, свяжитесь с поддержкой.');
      return;
    }
    let confirmation = 'Платеж получен. ';
    switch (result.fulfillment.kind) {
      case 'subscription':
        confirmation += `Подписка ${result.fulfillment.tier ?? ''} активирована.`;
        break;
      case 'pack':
        confirmation += `Пакет ${result.fulfillment.pack ?? ''} выдан.`;
        break;
      case 'inventory':
        confirmation += 'Предмет добавлен в инвентарь.';
        break;
      default:
        confirmation += 'Обновления применены.';
        break;
    }
    await ctx.reply(confirmation.trim());
    if (result.fulfillment.kind === 'inventory' && result.fulfillment.dialogId) {
      const followUp = await orchestrator.handleMessage({
        dialogId: result.fulfillment.dialogId,
        userId: user.id,
        text: 'Предмет оплачен, продолжаем расследование.',
      });
      await ctx.reply(followUp.userVisibleText);
    }
  } catch (error) {
    console.error('Failed to handle payment', error);
    await ctx.reply('Не удалось обработать оплату. Если списание произошло, свяжитесь с поддержкой.');
  }
});

run(bot);
