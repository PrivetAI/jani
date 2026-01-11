import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { telegramAuth, requireAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createCharacter, listCharacters, updateCharacter, deleteCharacter, getCharacterById, type CharacterRecord, loadStats, setCharacterTags, getCharacterTags, getAllTags, createTag, deleteTag } from '../modules/index.js';
import { query } from '../db/pool.js';
import { config } from '../config.js';

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
    const characters = await listCharacters({ includeInactive: true });

    // Get likes counts for all characters
    const { getCharactersLikesCount } = await import('../modules/index.js');
    const likesMap = await getCharactersLikesCount(characters.map(c => c.id));

    // Load tags and author for each character
    const charactersWithTags = await Promise.all(
      characters.map(async (c: CharacterRecord) => {
        const tags = await getCharacterTags(c.id);

        // Get author info
        let createdBy: { id: number; name: string } | null = null;
        if (c.created_by) {
          const authorResult = await query<{ id: number; nickname: string | null; username: string | null }>(
            'SELECT id, nickname, username FROM users WHERE id = $1',
            [c.created_by]
          );
          if (authorResult.rows.length) {
            const author = authorResult.rows[0];
            createdBy = { id: author.id, name: author.nickname || 'Admin' };
          }
        }
        if (!createdBy) {
          createdBy = { id: 0, name: 'Admin' };
        }

        return {
          id: c.id,
          name: c.name,
          description: c.description_long,
          avatarUrl: c.avatar_url,
          systemPrompt: c.system_prompt,
          accessType: c.access_type,
          isActive: c.is_active,
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
      })
    );

    res.json({ characters: charactersWithTags });
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
    await deleteCharacter(id);
    res.status(204).send();
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

export const adminRouter = router;
