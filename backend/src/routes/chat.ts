import { Router } from 'express';
import { z } from 'zod';
import { telegramAuth } from '../middlewares/auth.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import {
    getCharacterById,
    countUserMessagesToday,
    getDialogHistory,
    addDialogMessage,
    getMemories,
    addMemory,
    deleteMemory,
    deleteAllMemories,
    isMemoryOwner,
    type MemoryCategory,
    getOrCreateSession,
    recordMessage,
    updateSessionSettings,
    type DialogRecord,
    getOrCreateEmotionalState,
    getMoodLabel,
} from '../modules/index.js';
import { chatSessionService } from '../services/chatSessionService.js';
import { config } from '../config.js';
import { query } from '../db/pool.js';

const router = Router();

// ============================================
// Chat Messages API
// ============================================

/** Get chat history with a character */
router.get(
    '/:characterId/messages',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const characterId = Number(req.params.characterId);
        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const offset = Number(req.query.offset) || 0;

        const character = await getCharacterById(characterId);
        if (!character || !character.is_active) {
            return res.status(404).json({ error: 'character_not_found', message: 'Персонаж не найден' });
        }

        const subscription = res.locals.subscription as { status: string } | undefined;
        if (character.access_type === 'premium' && subscription?.status !== 'active') {
            return res.status(403).json({ error: 'premium_required', message: 'Требуется подписка' });
        }

        const history = await getDialogHistory(req.auth!.id, characterId, limit + offset);
        const sliced = history.slice(offset);

        res.json({
            messages: sliced.map(m => ({
                id: m.id,
                role: m.role,
                text: m.message_text,
                createdAt: m.created_at,
            })),
            total: history.length,
            hasMore: history.length > offset + limit,
        });
    })
);

/** Send a message to character and get response */
const sendMessageSchema = z.object({
    message: z.string().min(1).max(4000),
});

router.post(
    '/:characterId/messages',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const characterId = Number(req.params.characterId);
        const parsed = sendMessageSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({ error: 'invalid_input', message: 'Сообщение обязательно' });
        }

        const character = await getCharacterById(characterId);
        if (!character || !character.is_active) {
            return res.status(404).json({ error: 'character_not_found', message: 'Персонаж не найден' });
        }

        const subscription = res.locals.subscription as { status: string } | undefined;
        const hasSubscription = subscription?.status === 'active';

        if (character.access_type === 'premium' && !hasSubscription) {
            return res.status(403).json({ error: 'premium_required', message: 'Требуется подписка' });
        }

        // Check message limit for free users
        if (!hasSubscription) {
            const used = await countUserMessagesToday(req.auth!.id);
            if (used >= config.freeDailyMessageLimit) {
                return res.status(429).json({
                    error: 'daily_limit_exceeded',
                    message: `Дневной лимит ${config.freeDailyMessageLimit} сообщений исчерпан`,
                    limits: {
                        remaining: 0,
                        total: config.freeDailyMessageLimit,
                        resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
                    },
                });
            }
        }

        try {
            const result = await chatSessionService.processMessage({
                telegramUserId: req.auth!.telegramUserId,
                username: req.auth!.username,
                messageText: parsed.data.message,
                characterId,
            });

            // Record message in session
            await recordMessage(req.auth!.id, characterId);

            // Get updated limits
            const usedNow = await countUserMessagesToday(req.auth!.id);

            res.json({
                userMessage: {
                    role: 'user',
                    text: parsed.data.message,
                    createdAt: new Date().toISOString(),
                },
                assistantMessage: {
                    role: 'assistant',
                    text: result.reply,
                    createdAt: new Date().toISOString(),
                },
                limits: hasSubscription ? null : {
                    remaining: Math.max(0, config.freeDailyMessageLimit - usedNow),
                    total: config.freeDailyMessageLimit,
                    resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
                },
            });
        } catch (error: any) {
            return res.status(500).json({ error: 'llm_error', message: error.message });
        }
    })
);

/** Delete recent messages (forget recent) */
const forgetRecentSchema = z.object({
    count: z.number().min(1).max(100).default(10),
});

router.post(
    '/:characterId/forget-recent',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const characterId = Number(req.params.characterId);
        const parsed = forgetRecentSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({ error: 'invalid_input', message: 'Некорректное количество' });
        }

        const result = await query(
            `DELETE FROM dialogs 
       WHERE id IN (
         SELECT id FROM dialogs 
         WHERE user_id = $1 AND character_id = $2 
         ORDER BY created_at DESC 
         LIMIT $3
       )`,
            [req.auth!.id, characterId, parsed.data.count]
        );

        res.json({
            success: true,
            deletedMessagesCount: result.rowCount ?? 0,
        });
    })
);

// ============================================
// Chat Session API (read-only, relationship updated by LLM)
// ============================================

/** Get session settings with emotional state */
router.get(
    '/:characterId/session',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const characterId = Number(req.params.characterId);
        const session = await getOrCreateSession(req.auth!.id, characterId);

        // Get multi-dimensional emotional state
        const emotionalState = await getOrCreateEmotionalState(req.auth!.id, characterId);

        res.json({
            id: session.id,
            userId: session.user_id,
            characterId: session.character_id,

            // New emotional state
            emotionalState: {
                attraction: emotionalState.attraction,
                trust: emotionalState.trust,
                affection: emotionalState.affection,
                dominance: emotionalState.dominance,
                closeness: emotionalState.closeness,
                mood: emotionalState.mood,
                moodLabel: getMoodLabel(emotionalState.mood),
            },
            lastMessageAt: session.last_message_at,
            messagesCount: session.messages_count,
            createdAt: session.created_at,
        });
    })
);

// Note: PATCH session - only for user settings like Model override
const updateSessionSchema = z.object({
    llmModel: z.string().nullable().optional(),
});

router.patch(
    '/:characterId/session',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const characterId = Number(req.params.characterId);
        const parsed = updateSessionSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({ error: 'invalid_input', message: 'Некорректные данные' });
        }

        const updated = await updateSessionSettings(req.auth!.id, characterId, {
            llm_model: parsed.data.llmModel
        });

        // Get emotional state
        const emotionalState = await getOrCreateEmotionalState(req.auth!.id, characterId);

        res.json({
            id: updated.id,
            userId: updated.user_id,
            characterId: updated.character_id,

            // New emotional state
            emotionalState: {
                attraction: emotionalState.attraction,
                trust: emotionalState.trust,
                affection: emotionalState.affection,
                dominance: emotionalState.dominance,
                closeness: emotionalState.closeness,
                mood: emotionalState.mood,
                moodLabel: getMoodLabel(emotionalState.mood),
            },
            lastMessageAt: updated.last_message_at,
            messagesCount: updated.messages_count,
            createdAt: updated.created_at,
            llmModel: updated.llm_model,
        });
    })
);

// ============================================
// Memory API
// ============================================

/** Get all memories for a character */
router.get(
    '/:characterId/memories',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const characterId = Number(req.params.characterId);
        const memories = await getMemories(req.auth!.id, characterId);

        res.json({
            memories: memories.map(m => ({
                id: m.id,
                type: m.memory_category,
                content: m.content,
                importance: m.importance,
                createdAt: m.created_at,
            })),
            total: memories.length,
        });
    })
);

/** Add a new memory */
const addMemorySchema = z.object({
    content: z.string().min(1).max(500),
    type: z.enum(['fact', 'preference', 'emotion', 'relationship']).default('fact'),
    importance: z.number().min(1).max(10).default(5),
});

router.post(
    '/:characterId/memories',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const characterId = Number(req.params.characterId);
        const parsed = addMemorySchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({ error: 'invalid_input', message: 'Некорректные данные' });
        }

        const memory = await addMemory(
            req.auth!.id,
            characterId,
            parsed.data.content,
            parsed.data.type as MemoryCategory,
            parsed.data.importance
        );

        res.status(201).json({
            id: memory.id,
            type: memory.memory_category,
            content: memory.content,
            importance: memory.importance,
            createdAt: memory.created_at,
        });
    })
);

/** Delete a specific memory */
router.delete(
    '/:characterId/memories/:memoryId',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const memoryId = Number(req.params.memoryId);

        // Check ownership
        const isOwner = await isMemoryOwner(memoryId, req.auth!.id);
        if (!isOwner) {
            return res.status(404).json({ error: 'memory_not_found', message: 'Память не найдена' });
        }

        const deleted = await deleteMemory(memoryId);

        res.json({
            success: deleted,
            deletedId: memoryId,
        });
    })
);

/** Delete all memories for a character */
router.delete(
    '/:characterId/memories',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const characterId = Number(req.params.characterId);
        const count = await deleteAllMemories(req.auth!.id, characterId);

        res.json({
            success: true,
            deletedCount: count,
        });
    })
);

export const chatRouter = router;
