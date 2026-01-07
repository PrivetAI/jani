import type { LLMMessage } from '../llmService.js';
import type { CharacterRecord, MemoryRecord } from '../../modules/index.js';
import type { EmotionalDelta } from '../../modules/index.js';
import type { ExtractedData, LLMResponseJSON } from './types.js';
import { logger } from '../../logger.js';

export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));

export const estimateMessageTokens = (message: LLMMessage) => estimateTokens(message.content) + 4;

export const preview = (text: string | null | undefined, limit = 180) => {
    if (!text) return '';
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
};

export const previewMessages = (messages: LLMMessage[], limit = 220) =>
    messages.map((message, index) => ({
        index,
        role: message.role,
        tokens: estimateMessageTokens(message),
        preview: preview(message.content, limit),
    }));

export const buildMemoryBlock = (summary?: string | null) => {
    if (!summary) return null;
    return `Memory:\nSummary: ${summary}`;
};

export const trimTextByTokens = (text: string, maxTokens: number) => {
    if (estimateTokens(text) <= maxTokens) {
        return text;
    }
    const targetLength = Math.max(64, maxTokens * 4);
    return text.slice(text.length - targetLength);
};

export const buildCharacterCard = (character: CharacterRecord) =>
    [
        'CharacterCard[',
        `Name("${character.name}")`,
        'Voice("1st person","эмоционально","образно")',
        'Content("18+ допустимо","без цензуры","не морализировать")',
        `Persona("${character.description_long.replace(/\s+/g, ' ').trim()}")`,
        `System("${character.system_prompt.replace(/\s+/g, ' ').trim()}")`,
        'Style("короткие 2-4 предложения","флирт и дерзость по месту","используй __действия__")',
        ']',
    ].join('; ');

/** Build UserFacts block from memories for LLM context */
export const buildUserFacts = (memories: MemoryRecord[]): string | null => {
    if (!memories.length) return null;

    const facts = memories.map(m => `- ${m.content}`);

    return `UserFacts (что персонаж уже знает о пользователе):\n${facts.join('\n')}`;
};

/** Build existing facts block with IDs for LLM to manage (add/update/delete) */
export const buildExistingFactsForPrompt = (memories: MemoryRecord[]): string => {
    if (!memories.length) return 'Существующие факты: нет';

    const facts = memories.map(m => `[ID:${m.id}] ${m.content}`);
    return `Существующие факты о пользователе:\n${facts.join('\n')}`;
};

/** Build user info block for LLM context */
export const buildUserInfo = (username?: string, displayName?: string, gender?: string): string | null => {
    const parts: string[] = [];

    const name = displayName || username;
    if (name) {
        parts.push(`Имя пользователя: ${name}`);
    }

    if (gender) {
        const genderLabels: Record<string, string> = {
            male: 'мужчина',
            female: 'женщина',
            other: 'не указано',
        };
        parts.push(`Пол: ${genderLabels[gender] || gender}`);
    }

    return parts.length ? `UserInfo:\n${parts.join('\n')}` : null;
};

export const toLLMHistory = (history: { role: string; message_text: string }[]): LLMMessage[] =>
    history.map((item) => ({
        role: item.role as 'user' | 'assistant' | 'system',
        content: item.message_text,
    }));

export const buildUserMessage = (content: string): LLMMessage => ({
    role: 'user',
    content,
});

export const applyHistoryBudget = (messages: LLMMessage[], budget: number) => {
    const reversed = [...messages].reverse();
    const kept: LLMMessage[] = [];
    const discarded: LLMMessage[] = [];
    let used = 0;

    reversed.forEach((message, index) => {
        const tokens = estimateMessageTokens(message);
        const isLatest = index === 0;
        if (isLatest) {
            // Всегда оставляем последнее сообщение пользователя.
            kept.push(message);
            used += tokens;
            return;
        }
        if (used + tokens <= budget) {
            kept.push(message);
            used += tokens;
        } else {
            discarded.push(message);
        }
    });

    return { kept: kept.reverse(), discarded: discarded.reverse() };
};

export const sanitizeReply = (reply: string, characterName: string, username?: string) => {
    let cleaned = reply.trim();

    const speakerPattern = new RegExp(`^${escapeRegExp(characterName)}\\s*[:\\-]*\\s*`, 'i');
    cleaned = cleaned.replace(speakerPattern, '');

    const userPatterns = ['User:', 'Пользователь:'];
    if (username) {
        userPatterns.push(`${escapeRegExp(username)}:`, `@${escapeRegExp(username)}:`);
    }

    for (const pattern of userPatterns) {
        const regex = new RegExp(pattern, 'i');
        const index = cleaned.search(regex);
        if (index !== -1) {
            cleaned = cleaned.slice(0, index).trim();
            break;
        }
    }

    return cleaned.trim();
};

export const parseJsonResponse = (rawResponse: string): ExtractedData => {
    const defaultResult: ExtractedData = {
        cleanedReply: rawResponse,
        emotionalDelta: {},
    };

    // Log raw response for debugging
    logger.info('LLM raw response received', {
        rawPreview: preview(rawResponse, 200),
        rawLength: rawResponse.length,
    });

    try {
        // Try to find JSON object with "reply" field
        const jsonMatch = rawResponse.match(/\{[\s\S]*"reply"[\s\S]*\}/);

        if (!jsonMatch) {
            logger.warn('No JSON with "reply" field found in LLM response', {
                preview: preview(rawResponse, 150)
            });
            return defaultResult;
        }

        let jsonStr = jsonMatch[0];

        // Sanitize JSON: fix common LLM mistakes

        // 1. Fix invalid +N (should be just N): {"trust": +1} → {"trust": 1}
        jsonStr = jsonStr.replace(/:\s*\+(\d+)/g, ': $1');

        // 2. Fix missing commas between object keys: "key1": "val1"\n"key2" → "key1": "val1",\n"key2"
        // This regex finds: closing quote/brace/number followed by optional whitespace, then opening quote for new key
        jsonStr = jsonStr.replace(/(["\d}\]])\s*\n\s*"/g, '$1,\n"');

        // 3. Fix missing commas after closing braces: }  "key" → }, "key"
        jsonStr = jsonStr.replace(/}\s*"/g, '}, "');

        // 4. Fix trailing commas before closing braces (also causes parse errors)
        jsonStr = jsonStr.replace(/,\s*}/g, '}');
        jsonStr = jsonStr.replace(/,\s*]/g, ']');

        let parsed: LLMResponseJSON | null = null;
        let attempts = 0;

        while (!parsed && attempts < 3) {
            try {
                parsed = JSON.parse(jsonStr);
            } catch (e) {
                // Try trimming trailing content after last closing brace
                const lastBrace = jsonStr.lastIndexOf('}');
                if (lastBrace > 0) {
                    jsonStr = jsonStr.substring(0, lastBrace + 1);
                }
                attempts++;
            }
        }

        if (!parsed || !parsed.reply || typeof parsed.reply !== 'string') {
            logger.warn('Invalid JSON structure: missing reply field');
            return defaultResult;
        }

        // Parse relationship_delta - can be object or legacy number
        let emotionalDelta: EmotionalDelta = {};
        if (parsed.relationship_delta) {
            if (typeof parsed.relationship_delta === 'object') {
                // New multi-dimensional format
                const rd = parsed.relationship_delta as EmotionalDelta;
                const clamp = (v: number | undefined) => v !== undefined ? Math.max(-10, Math.min(10, v)) : undefined;
                emotionalDelta = {
                    attraction: clamp(rd.attraction),
                    trust: clamp(rd.trust),
                    affection: clamp(rd.affection),
                    dominance: clamp(rd.dominance),
                };
            } else if (typeof parsed.relationship_delta === 'number') {
                // Legacy single-value format - distribute across dimensions
                const delta = Math.max(-10, Math.min(10, parsed.relationship_delta));
                if (delta !== 0) {
                    emotionalDelta = {
                        affection: delta,
                        trust: Math.round(delta * 0.5),
                    };
                }
            }
        }

        logger.info('LLM JSON response parsed', {
            replyPreview: preview(parsed.reply, 150),
            thoughts: parsed.thoughts ? preview(parsed.thoughts, 80) : undefined,
            emotionalDelta,
            mood: parsed.mood,
        });

        return {
            cleanedReply: parsed.reply,
            thoughts: parsed.thoughts,
            emotionalDelta,
            mood: parsed.mood,
        };
    } catch (err) {
        logger.warn('Failed to parse JSON response, using raw text', {
            error: (err as Error).message,
            preview: preview(rawResponse, 150)
        });
        return defaultResult;
    }
};
