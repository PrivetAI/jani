import { Router } from 'express';
import { z } from 'zod';
import { listCharacters, getCharacterById, type CharacterRecord } from '../modules/characters.js';
import { telegramAuth } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createSubscription } from '../modules/subscriptions.js';
import { recordPayment } from '../modules/payments.js';
import { getDialogHistory, countUserMessagesToday, type DialogRecord } from '../modules/dialogs.js';
import { config } from '../config.js';
import { updateLastCharacter, updateUserProfile, confirmAdult, buildUserProfile, findUserById } from '../modules/users.js';
import { getAllTags } from '../modules/tags.js';

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

    // Parse filters
    const search = req.query.search as string | undefined;
    const accessType = req.query.accessType as 'free' | 'premium' | undefined;
    const tagsParam = req.query.tags as string | undefined;
    const tagIds = tagsParam ? tagsParam.split(',').map(Number).filter(n => !isNaN(n)) : undefined;

    const characters = await listCharacters({
      includeInactive: false, // Users only see active characters
      search,
      accessType,
      tagIds
    });

    // If user is not premium, and they requested all or premium explicitly, we might need to hide premium characters or show them locked.
    // The previous logic filtered them out IF includePremium was false.
    // However, usually we want to SHOW them but maybe mark them locked?
    // The previous logic was: `const filtered = includePremium ? characters : characters.filter((c) => c.access_type === 'free');`
    // This implies non-premium users DON'T SEE premium characters at all.
    // I will preserve this behavior for consistency, unless the Roadmap says otherwise.
    // Roadmap says "Character Catalog". Usually seeing premium chars encourages subscription.
    // But let's stick to safe "previous behavior" + filters.

    // If user specifically asked for 'premium' but has no sub, they get empty list effectively if we filter strict.
    // Let's apply the visibility filter:
    const visibleCharacters = includePremium
      ? characters
      : characters.filter(c => c.access_type === 'free');

    res.json({ characters: visibleCharacters.map(characterResponse), includePremium });
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

// ============================================
// Tags API
// ============================================

router.get(
  '/tags',
  asyncHandler(async (req, res) => {
    const tags = await getAllTags();
    res.json({
      tags: tags.map(t => ({
        id: t.id,
        name: t.name,
        category: t.category,
      })),
    });
  })
);

// ============================================
// Profile API
// ============================================

router.get(
  '/profile',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const subscription = res.locals.subscription as { status: 'none' | 'active' | 'expired'; end_at?: string | null } | undefined;
    const user = await findUserById(req.auth!.id);

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json({
      profile: buildUserProfile(user, subscription ?? { status: 'none' }, config.adminTelegramIds),
    });
  })
);

const profileUpdateSchema = z.object({
  displayName: z.string().max(100).optional(),
  gender: z.string().max(50).optional(),
  language: z.enum(['ru', 'en']).optional(),
});

router.patch(
  '/profile',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректные данные', issues: parsed.error.errors });
    }

    const user = await updateUserProfile(req.auth!.id, {
      display_name: parsed.data.displayName,
      gender: parsed.data.gender,
      language: parsed.data.language,
    });

    const subscription = res.locals.subscription as { status: 'none' | 'active' | 'expired'; end_at?: string | null } | undefined;

    res.json({
      profile: buildUserProfile(user, subscription ?? { status: 'none' }, config.adminTelegramIds),
    });
  })
);

router.post(
  '/confirm-adult',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const user = await confirmAdult(req.auth!.id);
    res.json({
      success: true,
      isAdultConfirmed: user.is_adult_confirmed,
    });
  })
);

// ============================================
// Limits API
// ============================================

router.get(
  '/limits',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const subscription = res.locals.subscription as { status: string; end_at?: string } | undefined;
    const hasSubscription = subscription?.status === 'active';

    if (hasSubscription) {
      res.json({
        hasSubscription: true,
        messagesLimit: {
          total: -1,
          used: await countUserMessagesToday(req.auth!.id),
          remaining: -1,
          resetsAt: null,
        },
        subscription: {
          status: subscription.status,
          endAt: subscription.end_at,
        },
      });
    } else {
      const used = await countUserMessagesToday(req.auth!.id);
      res.json({
        hasSubscription: false,
        messagesLimit: {
          total: config.freeDailyMessageLimit,
          used,
          remaining: Math.max(0, config.freeDailyMessageLimit - used),
          resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
        },
        subscription: null,
      });
    }
  })
);

// ============================================
// Last Character API
// ============================================

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

// ============================================
// Subscription API
// ============================================

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

// ============================================
// Legacy Dialogs API - DEPRECATED
// Use /api/chats/:characterId/messages instead
// ============================================

// Keeping for backward compatibility, will be removed in next version
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
