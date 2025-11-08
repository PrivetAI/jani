import { Bot, InlineKeyboard } from 'grammy';
import { run } from '@grammyjs/runner';
import { getDatabase } from '@jani/db';
import { OrchestratorService } from '../../orchestrator/src/service';
import { ShopService } from '../../shop/src/service';
import { DialogStatus, SubscriptionTier } from '@jani/shared';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Bot will not start.');
  process.exit(1);
}

const db = getDatabase();
const orchestrator = new OrchestratorService(db);
const shop = new ShopService(db);

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
    keyboard = new InlineKeyboard().text(`Купить за ★?`, `buy:${offer.item_slug}:${dialog.id}`);
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
  if (!from) {
    await ctx.answerCallbackQuery({ text: 'Ошибка' });
    return;
  }
  const user = db.ensureUser(from.id.toString(), from.language_code);
  shop.checkout(user.id, itemSlug, 1);
  await ctx.answerCallbackQuery({ text: 'Оплачено' });
  await ctx.reply('Готово! 🔑 Ключ добавлен в инвентарь. Продолжаем.');
  const result = await orchestrator.handleMessage({ dialogId, userId: user.id, text: 'Предмет куплен, продолжаем.' });
  await ctx.reply(result.userVisibleText);
});

run(bot);
