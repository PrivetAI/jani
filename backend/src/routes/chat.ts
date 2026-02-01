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
    getOrCreateSession,
    recordMessage,
    updateSessionSettings,
    resetSession,
    deleteAllDialogs,
    deleteEmotionalState,
    type DialogRecord,
    getOrCreateEmotionalState,
    getLastAssistantMessage,
    deleteDialogMessage,
} from '../modules/index.js';
import { chatSessionService } from '../services/chatSessionService.js';
import { config } from '../config.js';
import { query } from '../db/pool.js';

const router = Router();

// ============================================
// Chat Messages API
// ============================================

/** Get chat history with a character (cursor-based pagination) */
router.get(
    '/:characterId/messages',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const characterId = Number(req.params.characterId);
        const limit = Math.min(Number(req.query.limit) || 50, 100);
        const before = req.query.before as string | undefined; // cursor

        const character = await getCharacterById(characterId);
        if (!character || !character.is_active) {
            return res.status(404).json({ error: 'character_not_found', message: 'Персонаж не найден' });
        }

        const subscription = res.locals.subscription as { status: string } | undefined;
        if (character.access_type === 'premium' && subscription?.status !== 'active') {
            return res.status(403).json({ error: 'premium_required', message: 'Требуется подписка' });
        }

        const result = await getDialogHistory(req.auth!.id, characterId, { limit, before });

        res.json({
            messages: result.messages.map(m => ({
                id: m.id,
                role: m.role,
                text: m.message_text,
                createdAt: m.created_at,
            })),
            hasMore: result.hasMore,
            nextCursor: result.nextCursor,
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
        if (!hasSubscription && config.enableMessageLimit) {
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
                limits: (hasSubscription || !config.enableMessageLimit) ? null : {
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

/** Regenerate last assistant message */
router.post(
    '/:characterId/regenerate',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const characterId = Number(req.params.characterId);

        const character = await getCharacterById(characterId);
        if (!character || !character.is_active) {
            return res.status(404).json({ error: 'character_not_found', message: 'Персонаж не найден' });
        }

        const subscription = res.locals.subscription as { status: string } | undefined;
        const hasSubscription = subscription?.status === 'active';

        if (character.access_type === 'premium' && !hasSubscription) {
            return res.status(403).json({ error: 'premium_required', message: 'Требуется подписка' });
        }

        // Check message limit (same as regular message)
        if (!hasSubscription && config.enableMessageLimit) {
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

        // Get last assistant message
        const lastAssistant = await getLastAssistantMessage(req.auth!.id, characterId);
        if (!lastAssistant) {
            return res.status(400).json({ error: 'no_message', message: 'Нет сообщения для перегенерации' });
        }

        // Get last user message (to regenerate from)
        const history = await getDialogHistory(req.auth!.id, characterId, { limit: 10 });
        const lastUserMsg = [...history.messages].reverse().find(m => m.role === 'user');
        if (!lastUserMsg) {
            return res.status(400).json({ error: 'no_user_message', message: 'Нет сообщения пользователя' });
        }

        // Delete the old assistant message
        await deleteDialogMessage(lastAssistant.id);

        try {
            // Generate new response using last user message
            const result = await chatSessionService.processMessage({
                telegramUserId: req.auth!.telegramUserId,
                username: req.auth!.username,
                messageText: lastUserMsg.message_text,
                characterId,
                isRegenerate: true,
            });

            // For limit counting: save user message with is_regenerated flag
            // This counts toward daily limit but won't appear in LLM history
            await addDialogMessage(req.auth!.id, characterId, 'user', lastUserMsg.message_text, true);

            // Get updated limits
            const usedNow = await countUserMessagesToday(req.auth!.id);

            res.json({
                assistantMessage: {
                    role: 'assistant',
                    text: result.reply,
                    createdAt: new Date().toISOString(),
                },
                limits: (hasSubscription || !config.enableMessageLimit) ? null : {
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
            },
            lastMessageAt: session.last_message_at,
            messagesCount: session.messages_count,
            createdAt: session.created_at,
            // LLM settings
            llmModel: session.llm_model,
            llmTemperature: session.llm_temperature,
            llmTopP: session.llm_top_p,
        });
    })
);

// ============================================
// LLM Settings API
// ============================================

/** Get user's LLM settings for a character */
router.get(
    '/:characterId/llm-settings',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const characterId = Number(req.params.characterId);
        const session = await getOrCreateSession(req.auth!.id, characterId);

        res.json({
            model: session.llm_model,
            temperature: session.llm_temperature,
            topP: session.llm_top_p,
        });
    })
);

/** Update user's LLM settings for a character */
const llmSettingsSchema = z.object({
    model: z.string().nullable().optional(),
    temperature: z.number().min(0).max(2).nullable().optional(),
    topP: z.number().min(0).max(1).nullable().optional(),
});

router.patch(
    '/:characterId/llm-settings',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const characterId = Number(req.params.characterId);
        const parsed = llmSettingsSchema.safeParse(req.body);

        if (!parsed.success) {
            return res.status(400).json({ error: 'invalid_input', message: 'Некорректные данные' });
        }

        const updated = await updateSessionSettings(req.auth!.id, characterId, {
            llm_model: parsed.data.model,
            llm_temperature: parsed.data.temperature,
            llm_top_p: parsed.data.topP,
        });

        res.json({
            model: updated.llm_model,
            temperature: updated.llm_temperature,
            topP: updated.llm_top_p,
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
            parsed.data.importance
        );

        res.status(201).json({
            id: memory.id,
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

// ============================================
// Reset Chat (Fresh Start)
// ============================================

/** Reset entire chat - delete all dialogs, memories, session, emotional state */
router.delete(
    '/:characterId/reset',
    telegramAuth,
    asyncHandler(async (req, res) => {
        const characterId = Number(req.params.characterId);
        const userId = req.auth!.id;

        // Delete all data
        const [deletedDialogs, deletedMemories] = await Promise.all([
            deleteAllDialogs(userId, characterId),
            deleteAllMemories(userId, characterId),
            deleteEmotionalState(userId, characterId),
        ]);

        // Reset session (creates fresh one)
        const freshSession = await resetSession(userId, characterId);

        // Get fresh emotional state (will create with defaults)
        const freshEmotionalState = await getOrCreateEmotionalState(userId, characterId);

        res.json({
            success: true,
            deleted: {
                dialogs: deletedDialogs,
                memories: deletedMemories,
            },
            session: {
                id: freshSession.id,
                messagesCount: freshSession.messages_count,
                createdAt: freshSession.created_at,
            },
            emotionalState: {
                attraction: freshEmotionalState.attraction,
                trust: freshEmotionalState.trust,
                affection: freshEmotionalState.affection,
                dominance: freshEmotionalState.dominance,
                closeness: freshEmotionalState.closeness,
            },
        });
    })
);

export const chatRouter = router;

