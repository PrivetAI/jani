import { Router } from 'express';
import { z } from 'zod';
import { telegramAuth, requireAdmin } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createCharacter, listCharacters, updateCharacter, deleteCharacter, type CharacterRecord } from '../modules/characters.js';
import { loadStats } from '../modules/stats.js';
import { query } from '../db/pool.js';

const router = Router();

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
});

router.use(telegramAuth, requireAdmin);

router.get(
  '/characters',
  asyncHandler(async (_req, res) => {
    const characters = await listCharacters(true);
    res.json({
      characters: characters.map((c: CharacterRecord) => ({
        id: c.id,
        name: c.name,
        description: c.description_long,
        avatarUrl: c.avatar_url,
        systemPrompt: c.system_prompt,
        accessType: c.access_type,
        isActive: c.is_active,
        createdAt: c.created_at,
      })),
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
    const character = await createCharacter(parsed.data);
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
    const updated = await updateCharacter(id, parsed.data);
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

export const adminRouter = router;
