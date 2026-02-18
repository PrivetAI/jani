import { Router } from 'express';
import { z } from 'zod';
import { listCharacters, getCharacterById, type CharacterRecord, createSubscription, recordPayment, getDialogHistory, countUserMessagesToday, type DialogRecord, updateLastCharacter, updateUserProfile, confirmAdult, buildUserProfile, findUserById, getTagsWithCharacters, getAllTags, getCharacterTags, setRating, getUserRating, getCharacterRatings, getCharactersLikesCount, getUserSessions, getUserDailyLimit } from '../modules/index.js';
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
  isPrivate: character.is_private,
  grammaticalGender: character.grammatical_gender,
  tags: tags ?? [],
  greetingMessage: character.greeting_message,
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
    // 1. Filter by premium access
    // 2. Filter private characters (only visible to creator)
    const userId = req.auth!.id;
    const visibleCharacters = characters.filter(c => {
      // Private characters only visible to creator
      if (c.is_private && c.created_by !== userId) return false;
      // Premium characters only visible to premium users
      if (c.access_type === 'premium' && !includePremium) return false;
      return true;
    });

    // Get user's sessions to determine "my characters" (sorted by last_message_at DESC)
    const userSessions = await getUserSessions(req.auth!.id);
    const myCharacterIds = userSessions.map(s => s.character_id);

    // Add user's own private characters to myCharacterIds (even without dialog)
    const ownPrivateCharacters = characters
      .filter(c => c.created_by === userId && c.is_private)
      .map(c => c.id);
    const allMyCharacterIds = [...new Set([...ownPrivateCharacters, ...myCharacterIds])];

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

    res.json({ characters: charactersWithTags, includePremium, myCharacterIds: allMyCharacterIds });
  })
);

// ============================================
// Create Character (UGC)
// ============================================

const createCharacterSchema = z.object({
  name: z.string().min(1).max(100),
  description_long: z.string().min(1).max(2000),
  system_prompt: z.string().min(1).max(4000),
  avatar_url: z.string().optional().nullable(),
  grammatical_gender: z.enum(['male', 'female']).optional(),
  initial_attraction: z.number().min(-100).max(100).optional(),
  initial_trust: z.number().min(-100).max(100).optional(),
  initial_affection: z.number().min(-100).max(100).optional(),
  initial_dominance: z.number().min(-100).max(100).optional(),
  tag_ids: z.array(z.number()).optional(),
  llm_model: z.string().optional().nullable(),
  llm_provider: z.string().optional().nullable(),
  llm_temperature: z.number().min(0).max(2).optional().nullable(),
  llm_top_p: z.number().min(0).max(1).optional().nullable(),
  llm_repetition_penalty: z.number().min(0.5).max(2).optional().nullable(),
  is_private: z.boolean().optional(),
  greeting_message: z.string().max(1000).optional().nullable(),
});

router.post(
  '/characters',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const { setCharacterTags, invalidateCharactersCache } = await import('../modules/index.js');
    const { notifyNewCharacter } = await import('../services/telegramNotifier.js');

    const parsed = createCharacterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректные данные', issues: parsed.error.errors });
    }

    // Check if trying to create private character without premium
    const subscription = res.locals.subscription as { status: string } | undefined;
    const isPrivate = parsed.data.is_private ?? false;
    if (isPrivate && subscription?.status !== 'active') {
      return res.status(403).json({ message: 'Личные персонажи доступны только для Premium' });
    }

    // Private characters don't need moderation - auto-approved
    const needsModeration = !isPrivate;

    // Create character with random driver_prompt_version (1 or 2) for A/B testing
    const driverPromptVersion = Math.random() < 0.5 ? 1 : 2;

    const result = await query<{ id: number }>(
      `INSERT INTO characters (
         name, description_long, avatar_url, system_prompt, access_type, is_active, is_approved, is_private, created_by,
         grammatical_gender, initial_attraction, initial_trust, initial_affection, initial_dominance,
         llm_model, llm_provider, llm_temperature, llm_top_p, llm_repetition_penalty, driver_prompt_version, greeting_message
       )
       VALUES ($1, $2, $3, $4, 'free', TRUE, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
       RETURNING id`,
      [
        parsed.data.name,
        parsed.data.description_long,
        parsed.data.avatar_url ?? null,
        parsed.data.system_prompt,
        !needsModeration, // is_approved = true for private
        isPrivate,
        req.auth!.id,
        parsed.data.grammatical_gender ?? 'female',
        parsed.data.initial_attraction ?? 0,
        parsed.data.initial_trust ?? 10,
        parsed.data.initial_affection ?? 5,
        parsed.data.initial_dominance ?? 0,
        parsed.data.llm_model ?? null,
        parsed.data.llm_provider ?? null,
        parsed.data.llm_temperature ?? null,
        parsed.data.llm_top_p ?? null,
        parsed.data.llm_repetition_penalty ?? null,
        driverPromptVersion,
        parsed.data.greeting_message ?? null,
      ]
    );

    const characterId = result.rows[0].id;

    // Set tags if provided
    if (parsed.data.tag_ids && parsed.data.tag_ids.length > 0) {
      await setCharacterTags(characterId, parsed.data.tag_ids);
    }

    // Get tag names if tags were set
    let tagNames: string[] = [];
    if (parsed.data.tag_ids && parsed.data.tag_ids.length > 0) {
      const tagsResult = await query<{ name: string }>(
        'SELECT name FROM tags WHERE id = ANY($1)',
        [parsed.data.tag_ids]
      );
      tagNames = tagsResult.rows.map(t => t.name);
    }

    // Invalidate cache so new character appears immediately
    invalidateCharactersCache();

    // Notify admins about new character (skip for private)
    if (!isPrivate) {
      notifyNewCharacter({
        characterId,
        characterName: parsed.data.name,
        authorId: req.auth!.id,
        authorName: req.auth!.username || 'User',
        description: parsed.data.description_long,
        systemPrompt: parsed.data.system_prompt,
        gender: parsed.data.grammatical_gender ?? 'female',
        llmModel: parsed.data.llm_model,
        llmProvider: parsed.data.llm_provider,
        llmTemperature: parsed.data.llm_temperature,
        llmTopP: parsed.data.llm_top_p,
        llmRepetitionPenalty: parsed.data.llm_repetition_penalty,
        avatarUrl: parsed.data.avatar_url,
        tags: tagNames,
      }).catch(() => { }); // Fire and forget
    }

    res.status(201).json({
      character: { id: characterId },
      isPrivate,
      message: isPrivate ? 'Личный персонаж создан' : 'Персонаж отправлен на модерацию',
    });
  })
);

// Edit own UGC character (re-sends to moderation)
router.put(
  '/characters/:id',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const { setCharacterTags } = await import('../modules/index.js');
    const { notifyNewCharacter } = await import('../services/telegramNotifier.js');

    const characterId = Number(req.params.id);

    // Check that character belongs to user
    const existing = await query<{ created_by: number | null }>(
      'SELECT created_by FROM characters WHERE id = $1',
      [characterId]
    );

    if (!existing.rows.length) {
      return res.status(404).json({ message: 'Персонаж не найден' });
    }

    if (existing.rows[0].created_by !== req.auth!.id) {
      return res.status(403).json({ message: 'Нет прав на редактирование этого персонажа' });
    }

    const parsed = createCharacterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректные данные', issues: parsed.error.errors });
    }

    // Check if trying to make private without premium
    const subscription = res.locals.subscription as { status: string } | undefined;
    const isPrivate = parsed.data.is_private ?? false;
    if (isPrivate && subscription?.status !== 'active') {
      return res.status(403).json({ message: 'Личные персонажи доступны только для Premium' });
    }

    // Private characters don't need moderation
    const needsModeration = !isPrivate;

    // Update character and set is_approved = false (needs re-moderation) unless private
    // Also clear rejection_reason to move from rejected back to pending
    await query(
      `UPDATE characters SET
         name = $3,
         description_long = $4,
         avatar_url = $5,
         system_prompt = $6,
         grammatical_gender = $7,
         initial_attraction = $8,
         initial_trust = $9,
         initial_affection = $10,
         initial_dominance = $11,
         llm_model = $12,
         llm_provider = $13,
         llm_temperature = $14,
         llm_top_p = $15,
         llm_repetition_penalty = $16,
         is_private = $17,
         is_approved = $18,
         greeting_message = $19,
         rejection_reason = NULL
       WHERE id = $1 AND created_by = $2`,
      [
        characterId,
        req.auth!.id,
        parsed.data.name,
        parsed.data.description_long,
        parsed.data.avatar_url ?? null,
        parsed.data.system_prompt,
        parsed.data.grammatical_gender ?? 'female',
        parsed.data.initial_attraction ?? 0,
        parsed.data.initial_trust ?? 10,
        parsed.data.initial_affection ?? 5,
        parsed.data.initial_dominance ?? 0,
        parsed.data.llm_model ?? null,
        parsed.data.llm_provider ?? null,
        parsed.data.llm_temperature ?? null,
        parsed.data.llm_top_p ?? null,
        parsed.data.llm_repetition_penalty ?? null,
        isPrivate,
        !needsModeration, // is_approved = true for private
        parsed.data.greeting_message ?? null,
      ]
    );

    // Update tags
    if (parsed.data.tag_ids) {
      await setCharacterTags(characterId, parsed.data.tag_ids);
    }

    // Get tag names if tags were set
    let tagNames: string[] = [];
    if (parsed.data.tag_ids && parsed.data.tag_ids.length > 0) {
      const tagsResult = await query<{ name: string }>(
        'SELECT name FROM tags WHERE id = ANY($1)',
        [parsed.data.tag_ids]
      );
      tagNames = tagsResult.rows.map(t => t.name);
    }

    // Notify admins about updated character
    notifyNewCharacter({
      characterId,
      characterName: `[EDIT] ${parsed.data.name}`,
      authorId: req.auth!.id,
      authorName: req.auth!.username || 'User',
      description: parsed.data.description_long,
      systemPrompt: parsed.data.system_prompt,
      gender: parsed.data.grammatical_gender ?? 'female',
      llmModel: parsed.data.llm_model,
      llmProvider: parsed.data.llm_provider,
      llmTemperature: parsed.data.llm_temperature,
      llmTopP: parsed.data.llm_top_p,
      llmRepetitionPenalty: parsed.data.llm_repetition_penalty,
      avatarUrl: parsed.data.avatar_url,
      tags: tagNames,
    }).catch(() => { }); // Fire and forget

    res.json({
      character: { id: characterId },
      message: 'Персонаж обновлен и отправлен на модерацию',
    });
  })
);

// Get own character for editing (includes system_prompt)
router.get(
  '/characters/:id/edit',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const { getCharacterTags } = await import('../modules/index.js');
    const characterId = Number(req.params.id);

    const result = await query<{
      id: number;
      name: string;
      description_long: string;
      avatar_url: string | null;
      system_prompt: string;
      grammatical_gender: string;
      initial_attraction: number;
      initial_trust: number;
      initial_affection: number;
      initial_dominance: number;
      created_by: number;
      is_approved: boolean;
      is_private: boolean;
      llm_model: string | null;
      llm_provider: string | null;
      llm_temperature: number | null;
      llm_top_p: number | null;
      llm_repetition_penalty: number | null;
      greeting_message: string | null;
    }>(
      `SELECT id, name, description_long, avatar_url, system_prompt, grammatical_gender,
       initial_attraction, initial_trust, initial_affection, initial_dominance, created_by, is_approved, is_private,
       llm_model, llm_provider, llm_temperature, llm_top_p, llm_repetition_penalty, greeting_message
       FROM characters WHERE id = $1`,
      [characterId]
    );

    if (!result.rows.length) {
      return res.status(404).json({ message: 'Персонаж не найден' });
    }

    const character = result.rows[0];

    // Only owner can get full edit data
    if (character.created_by !== req.auth!.id) {
      return res.status(403).json({ message: 'Нет прав на редактирование' });
    }

    const tags = await getCharacterTags(characterId);

    res.json({
      character: {
        id: character.id,
        name: character.name,
        description: character.description_long,
        avatarUrl: character.avatar_url,
        systemPrompt: character.system_prompt,
        grammaticalGender: character.grammatical_gender || 'female',
        initialAttraction: character.initial_attraction ?? 0,
        initialTrust: character.initial_trust ?? 10,
        initialAffection: character.initial_affection ?? 5,
        initialDominance: character.initial_dominance ?? 0,
        llmModel: character.llm_model,
        llmProvider: character.llm_provider,
        llmTemperature: character.llm_temperature,
        llmTopP: character.llm_top_p,
        llmRepetitionPenalty: character.llm_repetition_penalty,
        isApproved: character.is_approved,
        isPrivate: character.is_private ?? false,
        tagIds: tags.map(t => t.id),
        greetingMessage: character.greeting_message,
      },
    });
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
// Character Deeplink (Share)
// ============================================

router.get(
  '/characters/:id/deeplink',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const character = await getCharacterById(id);

    if (!character || !character.is_active) {
      return res.status(404).json({ message: 'Персонаж не найден' });
    }

    // Private characters can only be shared by creator
    if (character.is_private && character.created_by !== req.auth!.id) {
      return res.status(403).json({ message: 'Нельзя поделиться чужим личным персонажем' });
    }

    // Format: c_<characterId>_ref_<userId> — includes both character and referral
    const userId = req.auth!.id;
    const deeplink = `https://t.me/${config.telegramBotUsername}?start=c_${character.id}_ref_${userId}`;
    const shareText = `Попробуй пообщаться с ${character.name} в Inny ! 💬`;

    res.json({
      deeplink,
      shareText,
      characterName: character.name,
    });
  })
);

// ============================================
// Tags API
// ============================================

router.get(
  '/tags',
  asyncHandler(async (req, res) => {
    // ?all=true returns all tags (for CreateCharacterPage)
    // otherwise returns only tags with active approved characters (for CharactersPage filter)
    const showAll = req.query.all === 'true';
    const tags = showAll ? await getAllTags() : await getTagsWithCharacters();
    res.json({
      tags: tags.map(t => ({
        id: t.id,
        name: t.name,
      })),
    });
  })
);

// ============================================
// Allowed Models API (for user LLM settings)
// ============================================

router.get(
  '/allowed-models',
  asyncHandler(async (req, res) => {
    const result = await query<{
      id: number;
      provider: string;
      model_id: string;
      display_name: string;
      is_default: boolean;
      is_recommended: boolean;
    }>(
      `SELECT id, provider, model_id, display_name, is_default, is_recommended 
       FROM allowed_models 
       WHERE is_active = TRUE 
       ORDER BY is_recommended DESC, is_default DESC, display_name ASC`
    );

    res.json({
      models: result.rows.map(m => ({
        id: m.id,
        modelId: m.model_id,
        displayName: m.display_name,
        provider: m.provider,
        isDefault: m.is_default,
        isRecommended: m.is_recommended,
      })),
    });
  })
);

// ============================================
// Comments API
// ============================================

const commentSchema = z.object({
  content: z.string().min(1),
  parentId: z.number().optional().nullable(),
});

router.get(
  '/characters/:id/comments',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const { getCharacterComments } = await import('../modules/index.js');
    const characterId = Number(req.params.id);
    const comments = await getCharacterComments(characterId);

    const mapComment = (c: any): any => ({
      id: c.id,
      content: c.content,
      createdAt: c.created_at,
      author: {
        id: c.user_id,
        name: c.author_nickname || c.author_username || 'Аноним',
      },
      isOwn: c.user_id === req.auth!.id,
      replies: c.replies?.map(mapComment) || [],
    });

    res.json({ comments: comments.map(mapComment) });
  })
);

router.post(
  '/characters/:id/comments',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const { createComment } = await import('../modules/index.js');
    const characterId = Number(req.params.id);
    const parsed = commentSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректные данные', issues: parsed.error.errors });
    }

    const comment = await createComment(
      req.auth!.id,
      characterId,
      parsed.data.content,
      parsed.data.parentId
    );

    res.status(201).json({
      comment: {
        id: comment.id,
        content: comment.content,
        createdAt: comment.created_at,
      },
    });
  })
);

router.delete(
  '/comments/:id',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const { deleteComment } = await import('../modules/index.js');
    const id = Number(req.params.id);
    const deleted = await deleteComment(id, req.auth!.id);

    if (!deleted) {
      return res.status(404).json({ message: 'Комментарий не найден или не принадлежит вам' });
    }

    res.status(204).send();
  })
);

// ============================================
// Author API
// ============================================

router.get(
  '/authors/:id',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const authorId = Number(req.params.id);
    const isOwnProfile = req.auth!.id === authorId;

    // Get author info
    const authorResult = await query<{ id: number; nickname: string | null; username: string | null }>(
      'SELECT id, nickname, username FROM users WHERE id = $1',
      [authorId]
    );

    if (!authorResult.rows.length) {
      return res.status(404).json({ message: 'Автор не найден' });
    }

    const author = authorResult.rows[0];

    // Get author's characters
    // If viewing own profile, include unapproved characters
    const characters = await listCharacters({
      includeInactive: false,
      includeUnapproved: isOwnProfile
    });
    const authorCharacters = characters.filter(c => c.created_by === authorId);

    // Get likes counts
    const likesMap = await getCharactersLikesCount(authorCharacters.map(c => c.id));

    // Load tags for each character
    const charactersWithTags = await Promise.all(
      authorCharacters.map(async (char) => {
        const tags = await getCharacterTags(char.id);
        return {
          id: char.id,
          name: char.name,
          description: char.description_long,
          avatarUrl: char.avatar_url,
          accessType: char.access_type,
          isApproved: char.is_approved,
          grammaticalGender: char.grammatical_gender || 'female',
          tags: tags.map(t => t.name),
          likesCount: likesMap.get(char.id) || 0,
        };
      })
    );

    res.json({
      author: {
        id: author.id,
        name: author.nickname || author.username || 'Аноним',
      },
      characters: charactersWithTags,
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
  voicePerson: z.union([z.literal(1), z.literal(3)]).optional(),
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
      voice_person: parsed.data.voicePerson,
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
          dayNumber: null,
        },
        subscription: {
          status: subscription.status,
          endAt: subscription.end_at,
        },
      });
    } else {
      const used = await countUserMessagesToday(req.auth!.id);
      const { limit, dayNumber } = await getUserDailyLimit(req.auth!.id);
      res.json({
        hasSubscription: false,
        messagesLimit: {
          total: limit,
          used,
          remaining: Math.max(0, limit - used),
          resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
          dayNumber,
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
// Referral API
// ============================================

import { getReferralStats } from '../modules/index.js';

// Get referral statistics
router.get(
  '/referral/stats',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const stats = await getReferralStats(req.auth!.id);
    res.json({ stats });
  })
);

// Get referral link
router.get(
  '/referral/link',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const botUsername = config.telegramBotUsername;
    const referralLink = `https://t.me/${botUsername}?start=ref_${req.auth!.id}`;
    res.json({ referralLink });
  })
);

// ============================================
// Subscription API
// ============================================

import { createSubscriptionInvoiceLink, SUBSCRIPTION_TIERS, type SubscriptionTier } from '../services/paymentService.js';

const invoiceSchema = z.object({
  tier: z.string(),
  type: z.enum(['subscription', 'bundle']).optional().default('subscription'),
});

// Create invoice link for Telegram Stars payment
router.post(
  '/payments/create-invoice',
  telegramAuth,
  asyncHandler(async (req, res) => {
    const parsed = invoiceSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректный тариф', issues: parsed.error.errors });
    }

    const { tier } = parsed.data;

    if (!SUBSCRIPTION_TIERS[tier as SubscriptionTier]) {
      return res.status(400).json({ message: 'Некорректный тариф подписки' });
    }
    const subscriptionTier = tier as SubscriptionTier;
    const invoiceLink = await createSubscriptionInvoiceLink(req.auth!.id, subscriptionTier);
    res.json({ invoiceLink, tier: SUBSCRIPTION_TIERS[subscriptionTier] });
  })
);

// Get subscription tiers info
router.get(
  '/payments/tiers',
  asyncHandler(async (_req, res) => {
    res.json({
      tiers: Object.entries(SUBSCRIPTION_TIERS).map(([key, value]) => ({
        id: key,
        ...value,
      })),
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
    const result = await getDialogHistory(req.auth!.id, characterId, { limit: 20 });
    res.json({
      messages: result.messages.map((item: DialogRecord) => ({
        id: item.id,
        role: item.role,
        text: item.message_text,
        createdAt: item.created_at,
      })),
    });
  })
);

export const publicRouter = router;
