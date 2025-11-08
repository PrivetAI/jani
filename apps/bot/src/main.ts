import { Bot, InlineKeyboard } from 'grammy';
import { run } from '@grammyjs/runner';
import {
  createDialog,
  ensureUser,
  getCharacters,
  getConfig,
  getPrismaClient,
  getQuotaToday,
  getSubscriptionTier,
} from '@jani/db';
import { OrchestratorService } from '../../orchestrator/src/service';
import { ShopService } from '../../shop/src/service';
import { DialogStatus } from '@prisma/client';
import { SubscriptionTier } from '@jani/shared';

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is not set. Bot will not start.');
  process.exit(1);
}

const prisma = getPrismaClient();
const orchestrator = new OrchestratorService(prisma);
const shop = new ShopService(prisma);
const config = getConfig();

const bot = new Bot(token);

const ensureDialog = async (userId: string) => {
  const existing = await prisma.dialog.findFirst({
    where: { userId, status: DialogStatus.open },
    orderBy: { createdAt: 'desc' },
  });
  if (existing) {
    return existing;
  }
  const characters = await getCharacters(prisma);
  const defaultCharacter = characters.find((char) => char.slug === 'arina-archivist') ?? characters[0];
  if (!defaultCharacter) {
    throw new Error('No characters available');
  }
  const storyId = defaultCharacter.stories[0]?.id;
  return createDialog(prisma, { userId, characterId: defaultCharacter.id, storyId });
};

bot.command('start', async (ctx) => {
  await ctx.reply('Привет! Я готов продолжить расследование. Просто напиши сообщение.');
});

bot.on('message:text', async (ctx) => {
  const from = ctx.from;
  if (!from) {
    return;
  }
  const user = await ensureUser(prisma, from.id.toString(), from.language_code);
  const dialog = await ensureDialog(user.id);
  const quota = await getQuotaToday(prisma, user.id);
  const limit = config.quotaDailyLimit;
  const tier = await getSubscriptionTier(prisma, user.id);
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
  const user = await ensureUser(prisma, from.id.toString(), from.language_code);
  await shop.checkout(user.id, itemSlug, 1);
  await ctx.answerCallbackQuery({ text: 'Оплачено' });
  await ctx.reply('Готово! 🔑 Ключ добавлен в инвентарь. Продолжаем.');
  const result = await orchestrator.handleMessage({ dialogId, userId: user.id, text: 'Предмет куплен, продолжаем.' });
  await ctx.reply(result.userVisibleText);
});

run(bot);
