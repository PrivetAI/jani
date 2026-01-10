import { Router } from 'express';
import { z } from 'zod';
import { listCharacters, getCharacterById, type CharacterRecord, createSubscription, recordPayment, getDialogHistory, countUserMessagesToday, type DialogRecord, updateLastCharacter, updateUserProfile, confirmAdult, buildUserProfile, findUserById, getAllTags, getCharacterTags, setRating, getUserRating, getCharacterRatings, getCharactersLikesCount, getUserSessions } from '../modules/index.js';
import { telegramAuth } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { config } from '../config.js';
import { query } from '../db/pool.js';

const router = Router();

const characterResponse = (character: CharacterRecord, tags?: string[]) => ({
  id: character.id,
  name: character.name,
  description: character.description_long,
  avatarUrl: character.avatar_url,
  accessType: character.access_type,
  isActive: character.is_active,
  grammaticalGender: character.grammatical_gender,
  tags: tags ?? [],
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

    // Apply the visibility filter
    const visibleCharacters = includePremium
      ? characters
      : characters.filter(c => c.access_type === 'free');

    // Get user's sessions to determine "my characters" (sorted by last_message_at DESC)
    const userSessions = await getUserSessions(req.auth!.id);
    const myCharacterIds = userSessions.map(s => s.character_id);

    // Get likes counts for all characters
    const likesMap = await getCharactersLikesCount(visibleCharacters.map(c => c.id));

    // Load tags for each character
    const charactersWithTags = await Promise.all(
      visibleCharacters.map(async (char) => {
        const tags = await getCharacterTags(char.id);
        return {
          ...characterResponse(char, tags.map(t => t.name)),
          likesCount: likesMap.get(char.id) || 0,
        };
      })
    );

    res.json({ characters: charactersWithTags, includePremium, myCharacterIds });
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

    // Get tags, ratings, and user's current rating
    const tags = await getCharacterTags(id);
    const ratings = await getCharacterRatings(id);
    const userRating = await getUserRating(req.auth!.id, id);

    // Get author info
    let author: { id: number; nickname: string | null; username: string | null } | null = null;
    if (character.created_by) {
      const authorResult = await query<{ id: number; nickname: string | null; username: string | null }>(
        'SELECT id, nickname, username FROM users WHERE id = $1',
        [character.created_by]
      );
      if (authorResult.rows.length) {
        author = authorResult.rows[0];
      }
    }

    res.json({
      character: {
        ...characterResponse(character, tags.map(t => t.name)),
        likesCount: ratings.likes,
        dislikesCount: ratings.dislikes,
        userRating,
        createdBy: author ? {
          id: author.id,
          name: author.nickname || 'Admin',
        } : { id: 0, name: 'Admin' },
      },
    });
  })
);

// ============================================
// Character Rating API
// ============================================

const ratingSchema = z.object({
  rating: z.union([z.literal(1), z.literal(-1), z.null()]),
});

router.post(
  '/characters/:id/rate',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const character = await getCharacterById(id);
    if (!character || !character.is_active) {
      return res.status(404).json({ message: 'Персонаж не найден' });
    }

    const parsed = ratingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректные данные', issues: parsed.error.errors });
    }

    await setRating(req.auth!.id, id, parsed.data.rating);
    const ratings = await getCharacterRatings(id);

    res.json({
      userRating: parsed.data.rating,
      likesCount: ratings.likes,
      dislikesCount: ratings.dislikes,
    });
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
  nickname: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/, 'Только латинские буквы, цифры и _').optional().nullable(),
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

    // Check nickname uniqueness if provided
    if (parsed.data.nickname) {
      const existing = await query<{ id: number }>(
        'SELECT id FROM users WHERE nickname = $1 AND id != $2',
        [parsed.data.nickname, req.auth!.id]
      );
      if (existing.rows.length) {
        return res.status(400).json({ message: 'Этот никнейм уже занят' });
      }
    }

    const user = await updateUserProfile(req.auth!.id, {
      display_name: parsed.data.displayName,
      nickname: parsed.data.nickname,
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
        messagesLimit: config.enableMessageLimit ? {
          total: -1,
          used: await countUserMessagesToday(req.auth!.id),
          remaining: -1,
          resetsAt: null,
        } : null,
        subscription: {
          status: subscription.status,
          endAt: subscription.end_at,
        },
      });
    } else {
      const used = await countUserMessagesToday(req.auth!.id);
      res.json({
        hasSubscription: false,
        messagesLimit: config.enableMessageLimit ? {
          total: config.freeDailyMessageLimit,
          used,
          remaining: Math.max(0, config.freeDailyMessageLimit - used),
          resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
        } : null,
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
