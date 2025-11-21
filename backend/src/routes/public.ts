import { Router } from 'express';
import { z } from 'zod';
import { listCharacters, getCharacterById, type CharacterRecord } from '../modules/characters.js';
import { telegramAuth } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createSubscription } from '../modules/subscriptions.js';
import { recordPayment } from '../modules/payments.js';
import { getDialogHistory, type DialogRecord } from '../modules/dialogs.js';
import { config } from '../config.js';
import { updateLastCharacter } from '../modules/users.js';

const router = Router();

const characterResponse = (character: CharacterRecord) => ({
  id: character.id,
  name: character.name,
  description: character.description_long,
  avatarUrl: character.avatar_url,
  accessType: character.access_type,
  isActive: character.is_active,
});

router.get(
  '/characters',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const subscription = res.locals.subscription as { status: string } | undefined;
    const includePremium = subscription?.status === 'active';
    const characters = await listCharacters();
    const filtered = includePremium ? characters : characters.filter((c) => c.access_type === 'free');
    res.json({ characters: filtered.map(characterResponse), includePremium });
  })
);

router.get(
  '/characters/:id',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const character = await getCharacterById(id);
    if (!character || !character.is_active) {
      return res.status(404).json({ message: 'Персонаж не найден' });
    }
    const subscription = res.locals.subscription as { status: string } | undefined;
    const includePremium = subscription?.status === 'active';
    if (character.access_type === 'premium' && !includePremium) {
      return res.status(403).json({ message: 'Требуется подписка' });
    }
    res.json({ character: characterResponse(character) });
  })
);

router.get(
  '/profile',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const subscription = res.locals.subscription as { status: 'none' | 'active' | 'expired'; end_at?: string | null } | undefined;
    res.json({
      profile: {
        telegramUserId: req.auth!.telegramUserId,
        username: req.auth!.username ?? null,
        lastCharacterId: req.auth!.lastCharacterId ?? null,
        subscriptionStatus: subscription?.status ?? 'none',
        subscriptionEndAt: subscription?.end_at ?? null,
        isAdmin: req.auth!.isAdmin,
      },
    });
  })
);

const lastCharacterSchema = z.object({
  characterId: z.number().nullable(),
});

router.patch(
  '/profile/last-character',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const parsed = lastCharacterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректные данные', issues: parsed.error.errors });
    }
    if (parsed.data.characterId !== null) {
      const character = await getCharacterById(parsed.data.characterId);
      if (!character || !character.is_active) {
        return res.status(404).json({ message: 'Персонаж не найден' });
      }
      const subscription = res.locals.subscription as { status: string } | undefined;
      if (character.access_type === 'premium' && subscription?.status !== 'active') {
        return res.status(403).json({ message: 'Нужна активная подписка' });
      }
    }
    await updateLastCharacter(req.auth!.id, parsed.data.characterId);
    req.auth!.lastCharacterId = parsed.data.characterId ?? undefined;
    res.json({ ok: true });
  })
);

const subscriptionSchema = z.object({ amountStars: z.number().min(1).default(199) });

router.post(
  '/subscriptions/mock-checkout',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const body = subscriptionSchema.safeParse(req.body ?? {});
    if (!body.success) {
      return res.status(400).json({ message: 'Некорректные данные' });
    }
    await recordPayment(req.auth!.id, body.data.amountStars, 'success');
    const subscription = await createSubscription(req.auth!.id, config.subscriptionDurationDays);
    res.json({
      subscription: {
        status: subscription.status,
        startAt: subscription.start_at,
        endAt: subscription.end_at,
      },
    });
  })
);

router.get(
  '/dialogs/:characterId',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const characterId = Number(req.params.characterId);
    const character = await getCharacterById(characterId);
    if (!character) {
      return res.status(404).json({ message: 'Персонаж не найден' });
    }
    const subscription = res.locals.subscription as { status: string } | undefined;
    if (character.access_type === 'premium' && subscription?.status !== 'active') {
      return res.status(403).json({ message: 'Нужна подписка' });
    }
    const history = await getDialogHistory(req.auth!.id, characterId, 20);
    res.json({
      messages: history.map((item: DialogRecord) => ({
        id: item.id,
        role: item.role,
        text: item.message_text,
        createdAt: item.created_at,
      })),
    });
  })
);

export const publicRouter = router;
