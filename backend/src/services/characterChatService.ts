import type { CharacterRecord } from '../modules/characters.js';
import type { DialogRecord } from '../modules/dialogs.js';
import { getDialogSummary, upsertDialogSummary } from '../modules/dialogSummaries.js';
import { getTopMemories, addMemory, type MemoryRecord, type MemoryCategory } from '../modules/memories.js';
import { adjustRelationshipScore, getOrCreateSession, getRelationshipLabel } from '../modules/sessions.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { llmService, type LLMMessage } from './llmService.js';

interface ChatRequest {
  userId: number;
  username?: string;
  character: CharacterRecord;
  userMessage: string;
  history: DialogRecord[];
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const estimateTokens = (text: string) => Math.max(1, Math.ceil(text.length / 4));
const estimateMessageTokens = (message: LLMMessage) => estimateTokens(message.content) + 4;
const preview = (text: string | null | undefined, limit = 180) => {
  if (!text) return '';
  return text.length > limit ? `${text.slice(0, limit)}…` : text;
};
const previewMessages = (messages: LLMMessage[], limit = 220) =>
  messages.map((message, index) => ({
    index,
    role: message.role,
    tokens: estimateMessageTokens(message),
    preview: preview(message.content, limit),
  }));

const buildHighlights = (messages: LLMMessage[], characterName: string, username?: string) =>
  messages.map((message) => {
    const speaker = message.role === 'assistant' ? characterName : username ? `@${username}` : 'User';
    return `- ${speaker}: ${preview(message.content, 160)}`;
  });

const buildMemoryBlock = (summary?: string | null, highlights?: string[]) => {
  const parts = [];
  if (summary) {
    parts.push(`Summary: ${summary}`);
  }
  if (highlights?.length) {
    parts.push(`Recent events:\n${highlights.join('\n')}`);
  }
  return parts.length ? `Memory:\n${parts.join('\n\n')}` : null;
};

const trimTextByTokens = (text: string, maxTokens: number) => {
  if (estimateTokens(text) <= maxTokens) {
    return text;
  }
  const targetLength = Math.max(64, maxTokens * 4);
  return text.slice(text.length - targetLength);
};

const buildCharacterCard = (character: CharacterRecord) =>
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

const buildScenario = (character: CharacterRecord, username?: string) => {
  if (character.scene_prompt) {
    // Replace {{username}} placeholder if present
    return character.scene_prompt.replace(/\{\{username\}\}/gi, username ? `@${username}` : 'пользователь');
  }
  // Default scene
  return `Scene: приватный чат в Telegram. Пользователь ${username ? `@${username}` : 'без ника'} общается с персонажем. Настрой: живой, интимный, игривый.`;
};

/** Build UserFacts block from memories for LLM context */
const buildUserFacts = (memories: MemoryRecord[]): string | null => {
  if (!memories.length) return null;

  const categoryLabels: Record<string, string> = {
    fact: 'Факт',
    preference: 'Предпочтение',
    emotion: 'Эмоция',
    relationship: 'Отношения',
  };

  const facts = memories.map(m => {
    const label = categoryLabels[m.memory_category] || 'Факт';
    return `- [${label}] ${m.content}`;
  });

  return `UserFacts (что персонаж уже знает о пользователе):\n${facts.join('\n')}`;
};

// Few-shot examples removed - they were polluting dialog context

const toLLMHistory = (history: DialogRecord[]): LLMMessage[] =>
  history.map((item) => ({
    role: item.role,
    content: item.message_text,
  }));

const buildUserMessage = (content: string): LLMMessage => ({
  role: 'user',
  content,
});

const applyHistoryBudget = (messages: LLMMessage[], budget: number) => {
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

const sanitizeReply = (reply: string, characterName: string, username?: string) => {
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

/** Parse JSON response from LLM */
interface LLMResponseJSON {
  reply: string;
  facts?: Array<{ content: string; importance: number }>;
  relationship_delta?: number;
}

interface ExtractedData {
  cleanedReply: string;
  facts: Array<{ content: string; importance: number }>;
  relationshipDelta: number;
}

const parseJsonResponse = (rawResponse: string): ExtractedData => {
  const defaultResult: ExtractedData = {
    cleanedReply: rawResponse,
    facts: [],
    relationshipDelta: 0,
  };

  // Log raw response for debugging
  logger.info('LLM raw response received', {
    rawPreview: preview(rawResponse, 200),
    rawLength: rawResponse.length,
  });

  try {
    // Try to find JSON object with "reply" field specifically
    // This is more precise than just finding any {...}
    const jsonMatch = rawResponse.match(/\{[^{}]*"reply"\s*:\s*"[^"]*"[^{}]*\}/s);

    // If no simple match, try greedy match for nested objects
    const fullJsonMatch = jsonMatch || rawResponse.match(/\{[\s\S]*"reply"[\s\S]*\}/);

    if (!fullJsonMatch) {
      logger.warn('No JSON with "reply" field found in LLM response', {
        preview: preview(rawResponse, 150)
      });
      return defaultResult;
    }

    // Try to extract just the JSON part (may need to clean up nested braces)
    let jsonStr = fullJsonMatch[0];

    // Try parsing progressively shorter strings if initial parse fails
    let parsed: LLMResponseJSON | null = null;
    let attempts = 0;
    while (!parsed && attempts < 3) {
      try {
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        // Try to find a balanced JSON by trimming from the end
        const lastBrace = jsonStr.lastIndexOf('}');
        if (lastBrace > 0) {
          jsonStr = jsonStr.substring(0, lastBrace + 1);
        }
        attempts++;
      }
    }

    if (!parsed) {
      logger.warn('Failed to parse extracted JSON', {
        jsonPreview: preview(jsonStr, 150)
      });
      return defaultResult;
    }

    logger.info('LLM JSON response parsed', {
      replyPreview: preview(parsed.reply, 150),
      factsCount: parsed.facts?.length || 0,
      facts: parsed.facts,
      relationshipDelta: parsed.relationship_delta || 0,
    });

    // Validate parsed structure
    if (!parsed.reply || typeof parsed.reply !== 'string') {
      logger.warn('Invalid JSON structure: missing reply field', {
        parsed
      });
      return defaultResult;
    }

    return {
      cleanedReply: parsed.reply,
      facts: (parsed.facts || []).filter(f =>
        f && typeof f.content === 'string' && f.content.length > 2
      ).map(f => ({
        content: f.content,
        importance: Math.max(1, Math.min(10, f.importance || 5)),
      })),
      relationshipDelta: Math.max(-10, Math.min(10, parsed.relationship_delta || 0)),
    };
  } catch (err) {
    logger.warn('Failed to parse JSON response, using raw text', {
      error: (err as Error).message,
      preview: preview(rawResponse, 150)
    });
    return defaultResult;
  }
};

export class CharacterChatService {
  private readonly conversationWindow = 8; // 4 реплики пользователя + 4 ассистента

  private buildStaticMessages(
    character: CharacterRecord,
    username?: string,
    memory?: string | null,
    userFacts?: string | null,
    relationshipScore?: number
  ) {
    const staticMessages: LLMMessage[] = [
      { role: 'system', content: config.driverPrompt },
      { role: 'system', content: buildCharacterCard(character) },
      { role: 'system', content: buildScenario(character, username) },
    ];

    // Add relationship context
    if (relationshipScore !== undefined) {
      const relationshipLabel = getRelationshipLabel(relationshipScore);
      staticMessages.push({
        role: 'system',
        content: `Текущие отношения с пользователем: ${relationshipLabel} (${relationshipScore}/100). Учитывай это в тоне и стиле ответа.`
      });
    }

    // Add user facts from long-term memory
    if (userFacts) {
      staticMessages.push({ role: 'system', content: userFacts });
    }

    // Add dialog memory/summary
    if (memory) {
      staticMessages.push({ role: 'system', content: memory });
    }

    // Note: Few-shot examples removed - they were polluting dialog context
    return staticMessages;
  }

  private countTokens(messages: LLMMessage[]) {
    return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
  }

  private async summarizeHistory(
    messages: LLMMessage[],
    characterName: string,
    existingSummary?: string | null
  ) {
    if (!messages.length && !existingSummary) {
      return null;
    }
    const transcript = messages
      .map((message) => {
        const speaker = message.role === 'assistant' ? characterName : 'User';
        return `${speaker}: ${message.content}`;
      })
      .join('\n');

    const summarySource = [
      existingSummary ? `Summary so far: ${existingSummary}` : null,
      transcript ? `New dialog:\n${transcript}` : null,
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    const summaryPrompt: LLMMessage[] = [
      {
        role: 'system',
        content: `ВАЖНО: Ответь ТОЛЬКО JSON объектом. Никаких рассуждений, мыслей, пояснений.

ФОРМАТ (ничего кроме этого):
{"summary": "резюме диалога в 3-4 предложениях"}

Пиши по-русски, от третьего лица (Пользователь..., Персонаж...).
НЕ ВЫВОДИ НИЧЕГО КРОМЕ JSON.`,
      },
      { role: 'user', content: trimTextByTokens(summarySource, 900) },
    ];

    try {
      const rawResponse = await llmService.generateReply(summaryPrompt, {
        temperature: config.summaryTemperature,
        topP: config.summaryTopP,
        repetitionPenalty: config.summaryRepetitionPenalty,
        maxTokens: config.summaryMaxTokens,
      });

      // Log raw response for debugging
      logger.info('Summary raw response received', {
        rawPreview: preview(rawResponse, 150),
        rawLength: rawResponse.length,
      });

      // Parse JSON summary - look specifically for "summary" field
      const jsonMatch = rawResponse.match(/\{[^{}]*"summary"\s*:\s*"[^"]*"[^{}]*\}/s)
        || rawResponse.match(/\{[\s\S]*"summary"[\s\S]*\}/);

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.summary && typeof parsed.summary === 'string') {
            logger.info('Summary JSON parsed successfully', {
              summaryPreview: preview(parsed.summary, 100)
            });
            return parsed.summary.trim();
          }
        } catch (e) {
          logger.warn('Failed to parse summary JSON', {
            error: (e as Error).message,
            jsonPreview: preview(jsonMatch[0], 100)
          });
        }
      }

      // Fallback: If no JSON or parse failed, log warning
      logger.warn('Summary returned no valid JSON, using raw text (potential reasoning leak)', {
        rawPreview: preview(rawResponse, 100)
      });
      return rawResponse.trim();

    } catch (error) {
      logger.error('Failed to summarize dialog', { error: (error as Error).message });
      return null;
    }
  }

  private async updateSummary(userId: number, characterId: number, summary: string | null) {
    if (!summary) {
      return null;
    }
    const trimmed = trimTextByTokens(summary, config.chatSummaryTokenLimit);
    await upsertDialogSummary(userId, characterId, trimmed);
    return trimmed;
  }

  async generateReply(request: ChatRequest): Promise<string> {
    const summaryRecord = await getDialogSummary(request.userId, request.character.id);
    const existingSummary = summaryRecord?.summary_text ?? null;

    // Fetch user memories for LLM context (Week 5)
    const memories = await getTopMemories(request.userId, request.character.id, 10);
    const userFacts = buildUserFacts(memories);

    // Fetch session for relationship context
    const session = await getOrCreateSession(request.userId, request.character.id);
    const relationshipScore = session.relationship_score;

    const historyMessages = toLLMHistory(request.history);
    const historyTokens = this.countTokens(historyMessages);
    const userTurn = buildUserMessage(request.userMessage);
    const pastMessages = historyMessages.slice(0, Math.max(0, historyMessages.length - this.conversationWindow));
    const windowMessages = historyMessages.slice(-this.conversationWindow);
    const unlimitedBudget = config.chatTokenBudget <= 0;
    logger.info('Chat request received', {
      userId: request.userId,
      characterId: request.character.id,
      username: request.username ?? null,
      userMessagePreview: preview(request.userMessage),
      historyCount: request.history.length,
      historyTokens,
      hasSummary: Boolean(existingSummary),
      summaryPreview: preview(existingSummary),
      memoriesCount: memories.length,
      pastCount: pastMessages.length,
      windowCount: windowMessages.length,
      budgetUnlimited: unlimitedBudget,
    });

    let promptSummary = existingSummary;
    if (pastMessages.length) {
      logger.info('Chat rolling summary candidate', {
        userId: request.userId,
        characterId: request.character.id,
        pastCount: pastMessages.length,
        pastTokens: this.countTokens(pastMessages),
      });
      const updated = await this.summarizeHistory(pastMessages, request.character.name, existingSummary);
      promptSummary = updated ?? promptSummary;
      logger.info('Chat rolling summary candidate ready', {
        userId: request.userId,
        characterId: request.character.id,
        promptSummaryPreview: preview(promptSummary),
      });
    }

    const highlights = buildHighlights(windowMessages, request.character.name, request.username);
    const memoryBlock = buildMemoryBlock(promptSummary, highlights);

    let staticMessages = this.buildStaticMessages(request.character, request.username, memoryBlock, userFacts, relationshipScore);
    let staticTokens = this.countTokens(staticMessages);
    logger.info('Chat static prompt prepared', {
      userId: request.userId,
      characterId: request.character.id,
      staticCount: staticMessages.length,
      staticTokens,
      staticMessages: previewMessages(staticMessages),
      budgetUnlimited: unlimitedBudget,
      hasMemory: Boolean(memoryBlock),
      hasUserFacts: Boolean(userFacts),
    });

    const windowWithUser = [...windowMessages, userTurn];
    const availableForWindow = unlimitedBudget
      ? Number.POSITIVE_INFINITY
      : Math.max(
        estimateMessageTokens(userTurn),
        config.chatTokenBudget - staticTokens - config.chatResponseReserve
      );
    let kept: LLMMessage[] = windowWithUser;
    let discarded: LLMMessage[] = [];
    if (!unlimitedBudget) {
      ({ kept, discarded } = applyHistoryBudget(windowWithUser, availableForWindow));
    }
    logger.info('Chat window prepared', {
      userId: request.userId,
      characterId: request.character.id,
      hasSummary: Boolean(promptSummary),
      windowCount: windowWithUser.length,
      availableForWindow: unlimitedBudget ? null : availableForWindow,
      budgetUnlimited: unlimitedBudget,
      keptCount: kept.length,
      keptTokens: this.countTokens(kept),
      discardedCount: discarded.length,
      discardedTokens: this.countTokens(discarded),
    });

    if (discarded.length) {
      logger.info('Chat window overflow summarizing', {
        userId: request.userId,
        characterId: request.character.id,
        discardedCount: discarded.length,
        discardedTokens: this.countTokens(discarded),
      });
      const overflowSummary = await this.summarizeHistory(discarded, request.character.name, promptSummary);
      promptSummary = overflowSummary ?? promptSummary;
      logger.info('Chat summary updated after overflow', {
        userId: request.userId,
        characterId: request.character.id,
        overflowSummaryPreview: preview(overflowSummary),
        promptSummaryPreview: preview(promptSummary),
      });

      staticMessages = this.buildStaticMessages(request.character, request.username, buildMemoryBlock(promptSummary, highlights), userFacts);
      staticTokens = this.countTokens(staticMessages);
      if (!unlimitedBudget) {
        ({ kept, discarded } = applyHistoryBudget(
          windowWithUser,
          Math.max(estimateMessageTokens(userTurn), config.chatTokenBudget - staticTokens - config.chatResponseReserve)
        ));
      }
      logger.info('Chat window after overflow summary', {
        userId: request.userId,
        characterId: request.character.id,
        staticTokens,
        availableForWindow: unlimitedBudget ? null : config.chatTokenBudget - staticTokens - config.chatResponseReserve,
        budgetUnlimited: unlimitedBudget,
        keptCount: kept.length,
        keptTokens: this.countTokens(kept),
        discardedCount: discarded.length,
        discardedTokens: this.countTokens(discarded),
      });
    }

    const messages: LLMMessage[] = [...staticMessages, ...kept];
    const promptTokens = this.countTokens(messages);
    logger.info('Chat prompt ready', {
      userId: request.userId,
      characterId: request.character.id,
      staticCount: staticMessages.length,
      historyCount: kept.length,
      promptTokens,
      stopCount: config.chatStopSequences.length,
      responseReserve: config.chatResponseReserve,
    });
    logger.info('Chat prompt preview', {
      userId: request.userId,
      characterId: request.character.id,
      messages: previewMessages(messages),
    });

    const generationSettings = {
      temperature: config.chatTemperature,
      topP: config.chatTopP,
      repetitionPenalty: request.character.llm_repetition_penalty ?? config.chatRepetitionPenalty,
      maxTokens: request.character.llm_max_tokens ?? config.chatResponseReserve,
      stop: config.chatStopSequences,
    };
    logger.info('Chat generation settings', {
      userId: request.userId,
      characterId: request.character.id,
      settings: generationSettings,
    });

    const rawReply = await llmService.generateReply(messages, {
      temperature: request.character.llm_temperature ?? config.chatTemperature,
      topP: request.character.llm_top_p ?? config.chatTopP,
      repetitionPenalty: request.character.llm_repetition_penalty ?? config.chatRepetitionPenalty,
      maxTokens: request.character.llm_max_tokens ?? config.chatResponseReserve,
      stop: config.chatStopSequences,
    });

    const sanitizedReply = sanitizeReply(rawReply, request.character.name, request.username);

    // Inline fact/relationship extraction (no extra LLM call)
    const extracted = parseJsonResponse(sanitizedReply);
    const finalReply = extracted.cleanedReply;

    // Save extracted facts
    if (extracted.facts.length > 0) {
      for (const fact of extracted.facts) {
        try {
          await addMemory(request.userId, request.character.id, fact.content, 'fact' as MemoryCategory, fact.importance);
        } catch (err) {
          logger.error('Failed to save extracted fact', { error: (err as Error).message, fact });
        }
      }
      logger.info('Chat inline facts extracted', {
        userId: request.userId,
        characterId: request.character.id,
        factsCount: extracted.facts.length,
        facts: extracted.facts,
      });
    }

    // Update relationship score if changed
    if (extracted.relationshipDelta !== 0) {
      try {
        await adjustRelationshipScore(request.userId, request.character.id, extracted.relationshipDelta);
        logger.info('Chat relationship score adjusted', {
          userId: request.userId,
          characterId: request.character.id,
          delta: extracted.relationshipDelta,
        });
      } catch (err) {
        logger.error('Failed to adjust relationship score', { error: (err as Error).message });
      }
    }

    logger.info('Chat reply produced', {
      userId: request.userId,
      characterId: request.character.id,
      rawReplyPreview: preview(rawReply),
      finalReplyPreview: preview(finalReply),
      extractedFacts: extracted.facts.length,
      relationshipDelta: extracted.relationshipDelta,
    });

    // Персистим резюме только после успешной генерации.
    const summarySource = [
      ...pastMessages,
      ...windowMessages,
      userTurn,
      { role: 'assistant', content: finalReply } as LLMMessage,
    ];
    const refreshedSummary = await this.summarizeHistory(summarySource, request.character.name, promptSummary);
    const storedSummary = await this.updateSummary(request.userId, request.character.id, refreshedSummary);
    logger.info('Chat summary stored', {
      userId: request.userId,
      characterId: request.character.id,
      hadSummary: Boolean(existingSummary),
      refreshedSummaryPreview: preview(refreshedSummary),
      storedSummaryPreview: preview(storedSummary),
    });

    return finalReply;
  }
}

export const characterChatService = new CharacterChatService();
