import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { telegramAuth, requireAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createCharacter, listCharacters, updateCharacter, deleteCharacter, getCharacterById, type CharacterRecord, loadStats, setCharacterTags, getCharacterTags, getCharacterTagsBatch, getAllTags, createTag, deleteTag, invalidateCharactersCache } from '../modules/index.js';
import { query } from '../db/pool.js';
import { config } from '../config.js';
import { logger } from '../logger.js';

const router = Router();

// Configure multer for uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only images are allowed'));
    }
  },
});

/** Upload avatar */
router.post(
  '/upload',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    // Verify real file type using magic bytes
    const { fileTypeFromFile } = await import('file-type');
    const type = await fileTypeFromFile(req.file.path);

    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

    if (!type || !allowedMimes.includes(type.mime)) {
      // Delete the invalid file
      fs.promises.unlink(req.file.path).catch(() => { });
      return res.status(400).json({ message: 'Invalid image format. Allowed: JPEG, PNG, WebP, GIF' });
    }

    // Rename file with correct extension based on actual type
    const correctExt = '.' + type.ext;
    const currentExt = path.extname(req.file.filename);

    if (currentExt.toLowerCase() !== correctExt) {
      const newFilename = req.file.filename.replace(/\.[^.]+$/, correctExt);
      const newPath = path.join(path.dirname(req.file.path), newFilename);
      await fs.promises.rename(req.file.path, newPath);
      const fileUrl = `/uploads/${newFilename}`;
      return res.json({ url: fileUrl });
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    res.json({ url: fileUrl });
  })
);

/** List all uploaded files */
router.get(
  '/uploads',
  asyncHandler(async (_req, res) => {
    const uploadDir = path.join(process.cwd(), 'uploads');

    if (!fs.existsSync(uploadDir)) {
      return res.json({ files: [], usedFiles: [] });
    }

    const files = await fs.promises.readdir(uploadDir);
    const fileStats = await Promise.all(
      files.map(async (filename) => {
        const filePath = path.join(uploadDir, filename);
        const stat = await fs.promises.stat(filePath);
        return {
          filename,
          url: `/uploads/${filename}`,
          size: stat.size,
          createdAt: stat.birthtime.toISOString(),
        };
      })
    );

    // Get all avatar_url values from characters
    const result = await query<{ avatar_url: string | null }>('SELECT avatar_url FROM characters WHERE avatar_url IS NOT NULL');
    const usedFiles = result.rows
      .map(r => r.avatar_url)
      .filter((url): url is string => url !== null)
      .map(url => url.replace('/uploads/', ''));

    res.json({
      files: fileStats.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      usedFiles
    });
  })
);

/** Delete unused uploads */
router.delete(
  '/uploads/unused',
  asyncHandler(async (_req, res) => {
    const uploadDir = path.join(process.cwd(), 'uploads');

    if (!fs.existsSync(uploadDir)) {
      return res.json({ deleted: [] });
    }

    const files = await fs.promises.readdir(uploadDir);

    // Get all avatar_url values from characters
    const result = await query<{ avatar_url: string | null }>('SELECT avatar_url FROM characters WHERE avatar_url IS NOT NULL');
    const usedFiles = new Set(
      result.rows
        .map(r => r.avatar_url)
        .filter((url): url is string => url !== null)
        .map(url => url.replace('/uploads/', ''))
    );

    const deleted: string[] = [];
    for (const filename of files) {
      if (!usedFiles.has(filename)) {
        await fs.promises.unlink(path.join(uploadDir, filename));
        deleted.push(filename);
      }
    }

    res.json({ deleted });
  })
);

/** Delete specific upload */
router.delete(
  '/uploads/:filename',
  asyncHandler(async (req, res) => {
    const { filename } = req.params;
    const uploadDir = path.join(process.cwd(), 'uploads');
    const filePath = path.join(uploadDir, filename);

    // Security: prevent path traversal
    if (!filePath.startsWith(uploadDir) || filename.includes('..')) {
      return res.status(400).json({ message: 'Invalid filename' });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Check if file is in use
    const result = await query<{ count: string }>('SELECT COUNT(*) as count FROM characters WHERE avatar_url = $1', [`/uploads/${filename}`]);
    if (parseInt(result.rows[0].count) > 0) {
      return res.status(400).json({ message: 'File is in use by a character' });
    }

    await fs.promises.unlink(filePath);
    res.json({ deleted: filename });
  })
);

const characterSchema = z.object({
  name: z.string().min(1),
  description_long: z.string().min(1),
  avatar_url: z
    .string()
    .optional()
    .nullable()
    .or(z.literal('').transform(() => undefined)),
  system_prompt: z.string().min(1),
  access_type: z.enum(['free', 'premium']),
  is_active: z.boolean().optional(),
  genre: z.string().optional().nullable(),
  grammatical_gender: z.enum(['male', 'female']).optional(),
  // Initial relationship values
  initial_attraction: z.number().min(-50).max(50).optional(),
  initial_trust: z.number().min(-50).max(50).optional(),
  initial_affection: z.number().min(-50).max(50).optional(),
  initial_dominance: z.number().min(-50).max(50).optional(),
  // LLM parameter overrides (null = use global defaults)
  llm_provider: z.enum(['openrouter', 'gemini', 'openai']).optional().nullable(),
  llm_model: z.string().optional().nullable(),
  llm_temperature: z.number().min(0).max(2).optional().nullable(),
  llm_top_p: z.number().min(0).max(1).optional().nullable(),
  llm_repetition_penalty: z.number().min(0).max(3).optional().nullable(),
  // Tags
  tag_ids: z.array(z.number()).optional(),
});

router.use(telegramAuth, requireAdmin);

/** Get available Gemini models */
router.get(
  '/gemini-models',
  asyncHandler(async (_req, res) => {
    if (!config.geminiApiKey) {
      return res.json({ models: [] });
    }
    try {
      const baseUrl = config.geminiProxyUrl || 'https://generativelanguage.googleapis.com';
      const response = await fetch(
        `${baseUrl}/v1beta/models?key=${config.geminiApiKey}`
      );
      if (!response.ok) {
        return res.json({ models: [] });
      }
      const data = await response.json() as { models?: Array<{ name: string; displayName: string; supportedGenerationMethods?: string[] }> };
      // Filter models that support generateContent
      const models = (data.models || [])
        .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
        .map(m => ({
          id: m.name.replace('models/', ''),
          name: m.displayName,
        }));
      res.json({ models });
    } catch (err) {
      res.json({ models: [] });
    }
  })
);

/** Get available OpenAI models */
router.get(
  '/openai-models',
  asyncHandler(async (_req, res) => {
    if (!config.openaiApiKey) {
      return res.json({ models: [] });
    }
    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          Authorization: `Bearer ${config.openaiApiKey}`,
        },
      });
      if (!response.ok) {
        return res.json({ models: [] });
      }
      const data = await response.json() as { data?: Array<{ id: string }> };
      // Filter to chat models (gpt-*)
      const models = (data.data || [])
        .filter(m => m.id.startsWith('gpt-'))
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(m => ({
          id: m.id,
          name: m.id,
        }));
      res.json({ models });
    } catch (err) {
      res.json({ models: [] });
    }
  })
);

/** Get available OpenRouter models */
router.get(
  '/openrouter-models',
  asyncHandler(async (_req, res) => {
    if (!config.openRouterApiKey) {
      return res.json({ models: [] });
    }
    try {
      const response = await fetch('https://openrouter.ai/api/v1/models', {
        headers: {
          Authorization: `Bearer ${config.openRouterApiKey}`,
        },
      });
      if (!response.ok) {
        return res.json({ models: [] });
      }
      const data = await response.json() as { data?: Array<{ id: string; name: string }> };
      const models = (data.data || [])
        .map(m => ({
          id: m.id,
          name: m.name || m.id,
        }));
      res.json({ models });
    } catch (err) {
      res.json({ models: [] });
    }
  })
);

/** Get common system prompt (read-only) */
router.get(
  '/system-prompt',
  asyncHandler(async (_req, res) => {
    res.json({ commonSystemPrompt: config.driverPrompt });
  })
);

/** Get global app settings */
router.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    const { getAllSettings } = await import('../repositories/appSettingsRepository.js');
    const settings = await getAllSettings();
    res.json({ settings });
  })
);

/** Update global app settings */
const updateSettingsSchema = z.object({
  summary_provider: z.enum(['openrouter', 'gemini', 'openai']).optional(),
  summary_model: z.string().optional(),
});

router.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_input', message: 'Некорректные данные' });
    }

    const { setSettings, getAllSettings } = await import('../repositories/appSettingsRepository.js');
    const updates: Record<string, string> = {};

    if (parsed.data.summary_provider !== undefined) {
      updates.summary_provider = parsed.data.summary_provider;
    }
    if (parsed.data.summary_model !== undefined) {
      updates.summary_model = parsed.data.summary_model;
    }

    await setSettings(updates);
    const settings = await getAllSettings();
    res.json({ settings });
  })
);

router.get(
  '/characters',
  asyncHandler(async (req, res) => {
    const characters = await listCharacters({ includeInactive: true, includeUnapproved: true });

    // Get likes counts for all characters
    const { getCharactersLikesCount } = await import('../modules/index.js');
    const likesMap = await getCharactersLikesCount(characters.map(c => c.id));

    // Load tags for all characters in one batch query
    const tagsByCharacter = await getCharacterTagsBatch(characters.map(c => c.id));

    // Load authors for all characters in one batch query
    const authorIds = [...new Set(characters.map(c => c.created_by).filter((id): id is number => id !== null))];
    const authorsMap = new Map<number, { id: number; name: string }>();
    if (authorIds.length > 0) {
      const authorsResult = await query<{ id: number; nickname: string | null; username: string | null }>(
        'SELECT id, nickname, username FROM users WHERE id = ANY($1)',
        [authorIds]
      );
      for (const author of authorsResult.rows) {
        authorsMap.set(author.id, { id: author.id, name: author.nickname || 'Admin' });
      }
    }

    const charactersWithTags = characters.map((c: CharacterRecord) => {
      const tags = tagsByCharacter.get(c.id) || [];
      const createdBy = c.created_by ? authorsMap.get(c.created_by) || { id: 0, name: 'Admin' } : { id: 0, name: 'Admin' };

      return {
        id: c.id,
        name: c.name,
        description: c.description_long,
        avatarUrl: c.avatar_url,
        systemPrompt: c.system_prompt,
        accessType: c.access_type,
        isActive: c.is_active,
        isApproved: c.is_approved,
        createdAt: c.created_at,
        createdBy,
        likesCount: likesMap.get(c.id) || 0,
        // Catalog fields
        genre: c.genre,
        grammaticalGender: c.grammatical_gender,
        // Initial relationship
        initialAttraction: c.initial_attraction,
        initialTrust: c.initial_trust,
        initialAffection: c.initial_affection,
        initialDominance: c.initial_dominance,
        // LLM fields
        llmProvider: c.llm_provider,
        llmModel: c.llm_model,
        llmTemperature: c.llm_temperature,
        llmTopP: c.llm_top_p,
        llmRepetitionPenalty: c.llm_repetition_penalty,
        // Tags
        tagIds: tags.map(t => t.id),
      };
    });

    res.json({ characters: charactersWithTags });
  })
);

// ============================================
// UGC Moderation
// ============================================

/** Get pending (unapproved) characters for moderation */
router.get(
  '/characters/pending',
  asyncHandler(async (req, res) => {
    const result = await query<{
      id: number;
      name: string;
      description_long: string;
      avatar_url: string | null;
      system_prompt: string;
      created_at: string;
      created_by: number;
    }>(
      `SELECT id, name, description_long, avatar_url, system_prompt, created_at, created_by
       FROM characters
       WHERE is_approved = FALSE
       ORDER BY created_at DESC`
    );

    const pendingCharacters = await Promise.all(
      result.rows.map(async (c) => {
        let createdBy: { id: number; name: string } = { id: 0, name: 'Unknown' };
        if (c.created_by) {
          const authorResult = await query<{ id: number; nickname: string | null; username: string | null }>(
            'SELECT id, nickname, username FROM users WHERE id = $1',
            [c.created_by]
          );
          if (authorResult.rows.length) {
            const author = authorResult.rows[0];
            createdBy = { id: author.id, name: author.nickname || author.username || 'User' };
          }
        }

        return {
          id: c.id,
          name: c.name,
          description: c.description_long,
          avatarUrl: c.avatar_url,
          systemPrompt: c.system_prompt,
          createdAt: c.created_at,
          createdBy,
        };
      })
    );

    res.json({ characters: pendingCharacters });
  })
);

/** Approve a character */
router.patch(
  '/characters/:id/approve',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);

    // Get character info and creator's telegram ID before approval
    const characterResult = await query<{
      name: string;
      created_by: number;
    }>(
      'SELECT name, created_by FROM characters WHERE id = $1',
      [id]
    );

    if (!characterResult.rows.length) {
      return res.status(404).json({ message: 'Персонаж не найден' });
    }

    const character = characterResult.rows[0];

    // Get creator's telegram_id
    const userResult = await query<{ telegram_id: number }>(
      'SELECT telegram_id FROM users WHERE id = $1',
      [character.created_by]
    );

    // Approve character
    await query('UPDATE characters SET is_approved = TRUE WHERE id = $1', [id]);
    invalidateCharactersCache();

    // Notify user if telegram_id exists
    if (userResult.rows.length && userResult.rows[0].telegram_id) {
      const { notifyUserCharacterApproved } = await import('../services/telegramNotifier.js');
      notifyUserCharacterApproved({
        characterId: id,
        characterName: character.name,
        userTelegramId: userResult.rows[0].telegram_id,
      }).catch(() => { }); // Fire and forget
    }

    res.json({ success: true });
  })
);

/** Reject (delete) a character */
router.delete(
  '/characters/:id/reject',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    // Get character info before deleting for logging
    const charResult = await query<{ id: number; name: string }>('SELECT id, name FROM characters WHERE id = $1 AND is_approved = FALSE', [id]);
    if (!charResult.rows.length) {
      logger.warn('Admin: reject character failed - not found or already approved', { characterId: id, adminId: req.auth?.id });
      return res.status(404).json({ message: 'Персонаж не найден или уже одобрен' });
    }
    const character = charResult.rows[0];
    // Only delete unapproved characters
    const result = await query('DELETE FROM characters WHERE id = $1 AND is_approved = FALSE RETURNING id', [id]);
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Персонаж не найден или уже одобрен' });
    }
    logger.info('Admin: character rejected', { characterId: id, characterName: character.name, adminId: req.auth?.id });
    res.status(204).send();
  })
);

/** Get single character with full settings */
router.get(
  '/characters/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const character = await getCharacterById(id);
    if (!character) {
      return res.status(404).json({ error: 'not_found', message: 'Персонаж не найден' });
    }
    res.json({
      character: {
        id: character.id,
        name: character.name,
        description: character.description_long,
        avatarUrl: character.avatar_url,
        systemPrompt: character.system_prompt,
        accessType: character.access_type,
        isActive: character.is_active,
        createdAt: character.created_at,
        // Catalog fields
        genre: character.genre,
        grammaticalGender: character.grammatical_gender,
        // Initial relationship
        initialAttraction: character.initial_attraction,
        initialTrust: character.initial_trust,
        initialAffection: character.initial_affection,
        initialDominance: character.initial_dominance,
        // LLM parameters
        llmProvider: character.llm_provider,
        llmModel: character.llm_model,
        llmTemperature: character.llm_temperature,
        llmTopP: character.llm_top_p,
        llmRepetitionPenalty: character.llm_repetition_penalty,
      },
      commonSystemPrompt: config.driverPrompt,
    });
  })
);

router.post(
  '/characters',
  asyncHandler(async (req, res) => {
    const parsed = characterSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректные данные', issues: parsed.error.errors });
    }
    // Pass the admin user's ID as creator
    const character = await createCharacter({
      ...parsed.data,
      created_by: req.auth!.id,
    });
    res.status(201).json({ character: { id: character.id } });
  })
);

router.put(
  '/characters/:id',
  asyncHandler(async (req, res) => {
    const parsed = characterSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректные данные', issues: parsed.error.errors });
    }
    const id = Number(req.params.id);

    // Extract tag_ids before updating character
    const { tag_ids, ...characterData } = parsed.data;

    const updated = await updateCharacter(id, characterData);

    // Update tags if provided
    if (tag_ids !== undefined) {
      await setCharacterTags(id, tag_ids);
    }

    res.json({ character: { id: updated.id } });
  })
);

router.patch(
  '/characters/:id/status',
  asyncHandler(async (req, res) => {
    const body = z.object({ is_active: z.boolean() }).safeParse(req.body);
    if (!body.success) {
      return res.status(400).json({ message: 'Некорректные данные' });
    }
    const updated = await updateCharacter(Number(req.params.id), body.data);
    res.json({ character: { id: updated.id, isActive: updated.is_active } });
  })
);

router.delete(
  '/characters/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    // Get character info before deleting for logging
    const character = await getCharacterById(id);
    if (!character) {
      logger.warn('Admin: delete character failed - not found', { characterId: id, adminId: req.auth?.id });
      return res.status(404).json({ message: 'Персонаж не найден' });
    }
    logger.info('Admin: deleting character', { characterId: id, characterName: character.name, adminId: req.auth?.id });
    try {
      await deleteCharacter(id);
      logger.info('Admin: character deleted successfully', { characterId: id, characterName: character.name, adminId: req.auth?.id });
      res.status(204).send();
    } catch (error) {
      logger.error('Admin: delete character failed', { characterId: id, characterName: character.name, adminId: req.auth?.id, error: (error as Error).message });
      throw error;
    }
  })
);

router.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const result = await query<{
      id: number;
      telegram_user_id: number;
      username: string | null;
      subscription_status: string;
      subscription_end_at: string | null;
      created_at: string;
    }>(
      `SELECT u.id, u.telegram_user_id, u.username, COALESCE(s.status::text, 'none') as subscription_status, s.end_at as subscription_end_at, u.created_at
       FROM users u
       LEFT JOIN LATERAL (
        SELECT status, end_at FROM subscriptions WHERE user_id = u.id ORDER BY end_at DESC LIMIT 1
       ) s ON TRUE
       ORDER BY u.created_at DESC`
    );

    res.json({
      users: result.rows.map((row: {
        id: number;
        telegram_user_id: number;
        username: string | null;
        subscription_status: string;
        subscription_end_at: string | null;
        created_at: string;
      }) => ({
        id: row.id,
        telegramUserId: row.telegram_user_id,
        username: row.username,
        subscriptionStatus: row.subscription_status,
        subscriptionEndAt: row.subscription_end_at,
        createdAt: row.created_at,
      })),
    });
  })
);

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const period = (req.query.period as string) ?? 'day';
    const stats = await loadStats(period as any);
    res.json({ stats });
  })
);

// ===== TAG MANAGEMENT =====

const tagSchema = z.object({
  name: z.string().min(1),
});

/** Get all tags */
router.get(
  '/tags',
  asyncHandler(async (_req, res) => {
    const tags = await getAllTags();
    res.json({
      tags: tags.map(t => ({
        id: t.id,
        name: t.name,
      })),
    });
  })
);

/** Create a new tag */
router.post(
  '/tags',
  asyncHandler(async (req, res) => {
    const parsed = tagSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректные данные', issues: parsed.error.errors });
    }
    const tag = await createTag(parsed.data.name);
    res.status(201).json({
      tag: {
        id: tag.id,
        name: tag.name,
      },
    });
  })
);

/** Delete a tag */
router.delete(
  '/tags/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const deleted = await deleteTag(id);
    if (!deleted) {
      return res.status(404).json({ message: 'Тег не найден' });
    }
    res.status(204).send();
  })
);

// ===== ALLOWED MODELS MANAGEMENT =====

const allowedModelSchema = z.object({
  provider: z.enum(['openrouter', 'gemini', 'openai']),
  model_id: z.string().min(1),
  display_name: z.string().min(1),
  is_default: z.boolean().optional(),
  is_fallback: z.boolean().optional(),
  is_recommended: z.boolean().optional(),
  is_active: z.boolean().optional(),
});

/** Get all allowed models */
router.get(
  '/allowed-models',
  asyncHandler(async (_req, res) => {
    const result = await query<{
      id: number;
      provider: string;
      model_id: string;
      display_name: string;
      is_default: boolean;
      is_fallback: boolean;
      is_recommended: boolean;
      is_active: boolean;
    }>('SELECT * FROM allowed_models ORDER BY is_default DESC, is_recommended DESC, display_name ASC');

    res.json({
      models: result.rows.map(m => ({
        id: m.id,
        provider: m.provider,
        modelId: m.model_id,
        displayName: m.display_name,
        isDefault: m.is_default,
        isFallback: m.is_fallback,
        isRecommended: m.is_recommended,
        isActive: m.is_active,
      })),
    });
  })
);

/** Create allowed model */
router.post(
  '/allowed-models',
  asyncHandler(async (req, res) => {
    const parsed = allowedModelSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректные данные', issues: parsed.error.errors });
    }

    // If setting as default, clear other defaults
    if (parsed.data.is_default) {
      await query('UPDATE allowed_models SET is_default = FALSE WHERE is_default = TRUE');
    }

    // If setting as fallback, clear other fallbacks (only one global fallback)
    if (parsed.data.is_fallback) {
      await query('UPDATE allowed_models SET is_fallback = FALSE WHERE is_fallback = TRUE');
    }

    const result = await query<{ id: number }>(
      `INSERT INTO allowed_models (provider, model_id, display_name, is_default, is_fallback, is_recommended, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [
        parsed.data.provider,
        parsed.data.model_id,
        parsed.data.display_name,
        parsed.data.is_default ?? false,
        parsed.data.is_fallback ?? false,
        parsed.data.is_recommended ?? false,
        parsed.data.is_active ?? true,
      ]
    );

    res.status(201).json({ id: result.rows[0].id });
  })
);

/** Update allowed model */
router.patch(
  '/allowed-models/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const parsed = allowedModelSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ message: 'Некорректные данные', issues: parsed.error.errors });
    }

    // If setting as default, clear other defaults
    if (parsed.data.is_default) {
      await query('UPDATE allowed_models SET is_default = FALSE WHERE is_default = TRUE AND id != $1', [id]);
    }

    // If setting as fallback, clear other fallbacks (only one global fallback)
    if (parsed.data.is_fallback) {
      await query('UPDATE allowed_models SET is_fallback = FALSE WHERE is_fallback = TRUE AND id != $1', [id]);
    }

    const updates: string[] = [];
    const values: any[] = [id];
    let paramIndex = 2;

    if (parsed.data.provider !== undefined) {
      updates.push(`provider = $${paramIndex++}`);
      values.push(parsed.data.provider);
    }
    if (parsed.data.model_id !== undefined) {
      updates.push(`model_id = $${paramIndex++}`);
      values.push(parsed.data.model_id);
    }
    if (parsed.data.display_name !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      values.push(parsed.data.display_name);
    }
    if (parsed.data.is_default !== undefined) {
      updates.push(`is_default = $${paramIndex++}`);
      values.push(parsed.data.is_default);
    }
    if (parsed.data.is_fallback !== undefined) {
      updates.push(`is_fallback = $${paramIndex++}`);
      values.push(parsed.data.is_fallback);
    }
    if (parsed.data.is_recommended !== undefined) {
      updates.push(`is_recommended = $${paramIndex++}`);
      values.push(parsed.data.is_recommended);
    }
    if (parsed.data.is_active !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      values.push(parsed.data.is_active);
    }

    if (updates.length === 0) {
      return res.json({ success: true });
    }

    await query(`UPDATE allowed_models SET ${updates.join(', ')} WHERE id = $1`, values);
    res.json({ success: true });
  })
);

/** Delete allowed model */
router.delete(
  '/allowed-models/:id',
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    // Get model info before deleting for logging
    const modelResult = await query<{ id: number; provider: string; model_id: string; display_name: string }>(
      'SELECT id, provider, model_id, display_name FROM allowed_models WHERE id = $1',
      [id]
    );
    if (!modelResult.rows.length) {
      logger.warn('Admin: delete allowed model failed - not found', { modelRecordId: id, adminId: req.auth?.id });
      return res.status(404).json({ message: 'Модель не найдена' });
    }
    const model = modelResult.rows[0];
    const result = await query('DELETE FROM allowed_models WHERE id = $1 RETURNING id', [id]);
    if (!result.rowCount) {
      return res.status(404).json({ message: 'Модель не найдена' });
    }
    logger.info('Admin: allowed model deleted', {
      modelRecordId: id,
      provider: model.provider,
      modelId: model.model_id,
      displayName: model.display_name,
      adminId: req.auth?.id
    });
    res.status(204).send();
  })
);

export const adminRouter = router;
