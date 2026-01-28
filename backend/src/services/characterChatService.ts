import type { CharacterRecord } from '../modules/index.js';
import { getDialogSummary, upsertDialogSummary } from '../modules/dialogSummaries.js';
import { getTopMemories } from '../modules/index.js';
import {
  getOrCreateEmotionalState,
  updateEmotionalState,
  buildEmotionalContext,
  type CharacterMood,
} from '../modules/index.js';
import { config } from '../config.js';
import { logger } from '../logger.js';
import { llmService, type LLMMessage } from './llmService.js';
import type { ChatRequest } from './chat/types.js';
import {
  estimateMessageTokens,
  buildMemoryBlock,
  trimTextByTokens,
  buildCharacterCard,
  buildUserFacts,
  buildExistingFactsForPrompt,
  buildUserInfo,
  toLLMHistory,
  buildUserMessage,
  applyHistoryBudget,
  sanitizeReply,
  parseJsonResponse,
} from './chat/utils.js';
import { SUMMARY_AND_FACTS_PROMPT } from '../prompts/chat.js';

export type { ChatRequest } from './chat/types.js';

export class CharacterChatService {
  private readonly conversationWindow = 7; // 7 из истории + 1 новое = 8 в промпте

  private buildSystemPrompt(
    character: CharacterRecord,
    voicePerson: 1 | 3 = 3,
    userInfo?: string | null,
    memory?: string | null,
    userFacts?: string | null,
    emotionalContext?: string | null
  ): string {
    const parts: string[] = [
      config.driverPrompt,
      '',
      buildCharacterCard(character, voicePerson),
    ];

    // Variables at the end for better LLM attention (recency bias)

    // Add emotional context (multi-dimensional relationships + mood)
    if (emotionalContext) {
      parts.push('');
      parts.push(emotionalContext);
    }

    // Add user info (name, gender)
    if (userInfo) {
      parts.push('');
      parts.push(userInfo);
    }

    // Add user facts from long-term memory
    if (userFacts) {
      parts.push('');
      parts.push(userFacts);
    }

    // Add dialog memory/summary
    if (memory) {
      parts.push('');
      parts.push(memory);
    }

    return parts.join('\n');
  }

  private buildStaticMessages(
    character: CharacterRecord,
    voicePerson: 1 | 3 = 3,
    userInfo?: string | null,
    memory?: string | null,
    userFacts?: string | null,
    emotionalContext?: string | null
  ): LLMMessage[] {
    const systemPrompt = this.buildSystemPrompt(character, voicePerson, userInfo, memory, userFacts, emotionalContext);
    return [{ role: 'system', content: systemPrompt }];
  }

  private countTokens(messages: LLMMessage[]) {
    return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
  }

  private async summarizeHistory(
    messages: LLMMessage[],
    characterName: string,
    existingSummary?: string | null,
    existingMemories?: Array<{ id: number; content: string }>
  ): Promise<{
    summary: string | null;
    memoryOperations: Array<{
      action: 'add' | 'update' | 'delete';
      id?: number;
      content?: string;
      importance?: number;
    }>;
  }> {
    const emptyResult = { summary: null, memoryOperations: [] };

    if (!messages.length && !existingSummary) {
      return emptyResult;
    }
    const transcript = messages
      .map((message) => {
        const speaker = message.role === 'assistant' ? characterName : 'User';
        return `${speaker}: ${message.content}`;
      })
      .join('\n');

    // Build existing facts for LLM
    const existingFactsBlock = existingMemories?.length
      ? `Существующие факты о пользователе:\n${existingMemories.map(m => `[ID:${m.id}] ${m.content}`).join('\n')}`
      : 'Существующие факты: нет';

    const summarySource = [
      existingSummary ? `Summary so far: ${existingSummary}` : null,
      existingFactsBlock,
      transcript ? `New dialog:\n${transcript}` : null,
    ]
      .filter(Boolean)
      .join('\n\n')
      .trim();

    const summaryPrompt: LLMMessage[] = [
      {
        role: 'system',
        content: SUMMARY_AND_FACTS_PROMPT,
      },
      { role: 'user', content: trimTextByTokens(summarySource, 1200) },
    ];

    try {
      // Fetch global summary settings
      const { getSettings } = await import('../repositories/appSettingsRepository.js');
      const summarySettings = await getSettings(['summary_provider', 'summary_model']);
      const summaryProvider = (summarySettings.summary_provider || 'openrouter') as 'openrouter' | 'gemini' | 'openai';
      const summaryModel = summarySettings.summary_model || undefined;

      const rawResponse = await llmService.generateReply(summaryPrompt, {
        temperature: config.summaryTemperature,
        topP: config.summaryTopP,
        repetitionPenalty: config.summaryRepetitionPenalty,
        maxTokens: config.summaryMaxTokens,
        provider: summaryProvider,
        model: summaryModel,
      });


      // Parse JSON - look for object with summary field
      const jsonMatch = rawResponse.match(/\{[\s\S]*"summary"[\s\S]*\}/);

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const summary = parsed.summary && typeof parsed.summary === 'string'
            ? parsed.summary.trim()
            : null;

          // Parse memory_operations array
          const memoryOperations = Array.isArray(parsed.memory_operations)
            ? parsed.memory_operations.filter((op: any) => {
              if (!op.action || !['add', 'update', 'delete'].includes(op.action)) return false;
              if (op.action === 'add') {
                return op.content && typeof op.content === 'string' && op.content.length > 3 && op.content.length < 300;
              }
              if (op.action === 'update') {
                return typeof op.id === 'number' && op.content && typeof op.content === 'string';
              }
              if (op.action === 'delete') {
                return typeof op.id === 'number';
              }
              return false;
            })
            : [];

          return { summary, memoryOperations };
        } catch (e) {
          logger.warn('Failed to parse summary+operations JSON', { error: (e as Error).message });
        }
      }

      logger.warn('Summary returned no valid JSON');
      return emptyResult;

    } catch (error) {
      logger.error('Failed to summarize dialog', { error: (error as Error).message });
      return emptyResult;
    }
  }

  private async updateSummary(userId: number, characterId: number, summary: string | null, summarizedMessageCount: number) {
    if (!summary) {
      return null;
    }
    const trimmed = trimTextByTokens(summary, config.chatSummaryTokenLimit);
    await upsertDialogSummary(userId, characterId, trimmed, summarizedMessageCount);
    return trimmed;
  }

  async generateReply(request: ChatRequest): Promise<{ reply: string; thoughts?: string }> {
    const summaryRecord = await getDialogSummary(request.userId, request.character.id);
    const existingSummary = summaryRecord?.summary_text ?? null;

    // Fetch user memories for LLM context (Week 5)
    const memories = await getTopMemories(request.userId, request.character.id, 10);
    const userFacts = buildUserFacts(memories);

    // Fetch emotional state for relationship context
    const emotionalState = await getOrCreateEmotionalState(request.userId, request.character.id);
    const emotionalContext = buildEmotionalContext(emotionalState, request.character.grammatical_gender);

    // Build user info for prompt
    const userInfo = buildUserInfo(request.username, request.userDisplayName, request.userGender);

    const historyMessages = toLLMHistory(request.history);
    const historyTokens = this.countTokens(historyMessages);
    const userTurn = buildUserMessage(request.userMessage);
    const pastMessages = historyMessages.slice(0, Math.max(0, historyMessages.length - this.conversationWindow));
    const windowMessages = historyMessages.slice(-this.conversationWindow);
    const unlimitedBudget = config.chatTokenBudget <= 0;

    let promptSummary = existingSummary;

    // Interval-based summarization: summarize every conversationWindow messages
    const lastSummarizedCount = summaryRecord?.summarized_message_count ?? 0;
    const totalMessagesAfterReply = request.history.length + 2; // +1 user +1 assistant
    const nextSummaryThreshold = lastSummarizedCount + this.conversationWindow;
    const shouldSummarize = totalMessagesAfterReply >= nextSummaryThreshold;

    if (shouldSummarize) {
      // Take messages from lastSummarizedCount to nextSummaryThreshold
      const messagesToSummarize = historyMessages.slice(lastSummarizedCount, nextSummaryThreshold);

      if (messagesToSummarize.length > 0) {
        // Fetch existing memories with IDs for LLM
        const { getMemories, addMemory, updateMemoryContent, deleteMemory } = await import('../modules/index.js');
        const existingMemories = await getMemories(request.userId, request.character.id);
        const memoriesForPrompt = existingMemories.map(m => ({ id: m.id, content: m.content }));

        const result = await this.summarizeHistory(
          messagesToSummarize,
          request.character.name,
          existingSummary,
          memoriesForPrompt
        );
        if (result.summary) {
          promptSummary = result.summary;
          await this.updateSummary(request.userId, request.character.id, result.summary, nextSummaryThreshold);
        }

        // Process memory operations from LLM
        for (const op of result.memoryOperations) {
          try {
            if (op.action === 'add' && op.content) {
              await addMemory(
                request.userId,
                request.character.id,
                op.content,
                op.importance ?? 5
              );
              logger.info('Memory added', { content: op.content });
            } else if (op.action === 'update' && op.id && op.content) {
              await updateMemoryContent(op.id, op.content);
              logger.info('Memory updated', { id: op.id, content: op.content });
            } else if (op.action === 'delete' && op.id) {
              await deleteMemory(op.id);
              logger.info('Memory deleted', { id: op.id });
            }
          } catch (err) {
            logger.warn('Memory operation failed', { op, error: (err as Error).message });
          }
        }
      }
    }

    const memoryBlock = buildMemoryBlock(promptSummary);
    const voicePerson = request.voicePerson ?? 3;

    let staticMessages = this.buildStaticMessages(request.character, voicePerson, userInfo, memoryBlock, userFacts, emotionalContext);
    let staticTokens = this.countTokens(staticMessages);

    // For regenerate: history already contains the last user message, don't add it again
    const windowWithUser = request.isRegenerate
      ? windowMessages
      : [...windowMessages, userTurn];
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

    if (discarded.length) {
      const overflowResult = await this.summarizeHistory(discarded, request.character.name, promptSummary);
      promptSummary = overflowResult.summary ?? promptSummary;

      staticMessages = this.buildStaticMessages(request.character, voicePerson, userInfo, buildMemoryBlock(promptSummary), userFacts, emotionalContext);
      staticTokens = this.countTokens(staticMessages);
      if (!unlimitedBudget) {
        ({ kept, discarded } = applyHistoryBudget(
          windowWithUser,
          Math.max(estimateMessageTokens(userTurn), config.chatTokenBudget - staticTokens - config.chatResponseReserve)
        ));
      }
    }

    const messages: LLMMessage[] = [...staticMessages, ...kept];
    const promptTokens = this.countTokens(messages);

    // Priority chain: User session settings > Character settings > Global config
    const sessionSettings = request.sessionLlmSettings;
    // Provider priority: session (from allowed_models) > character > default
    const resolvedProvider = (sessionSettings?.provider || request.character.llm_provider || 'openrouter') as 'openrouter' | 'gemini' | 'openai';
    const resolvedModel = sessionSettings?.model || request.character.llm_model || undefined;
    const resolvedTemperature = sessionSettings?.temperature ?? request.character.llm_temperature ?? config.chatTemperature;
    const resolvedTopP = sessionSettings?.topP ?? request.character.llm_top_p ?? config.chatTopP;

    const rawReply = await llmService.generateReply(messages, {
      model: resolvedModel,
      provider: resolvedProvider,
      temperature: resolvedTemperature,
      topP: resolvedTopP,
      repetitionPenalty: request.character.llm_repetition_penalty ?? config.chatRepetitionPenalty,
      stop: config.chatStopSequences,
    });

    const sanitizedReply = sanitizeReply(rawReply, request.character.name, request.username);

    // Parse JSON response for reply, emotional deltas, mood, and thoughts
    const extracted = parseJsonResponse(sanitizedReply);
    const finalReply = extracted.cleanedReply;

    // Update emotional state if any dimension changed
    const hasDelta = Object.values(extracted.emotionalDelta).some(v => v !== undefined && v !== 0);
    if (hasDelta || extracted.mood) {
      try {
        // Convert mood string to CharacterMood object
        const newMood: CharacterMood | undefined = extracted.mood
          ? { primary: extracted.mood, intensity: 6 }
          : undefined;

        await updateEmotionalState(
          request.userId,
          request.character.id,
          extracted.emotionalDelta,
          newMood
        );
      } catch (err) {
        logger.error('Failed to update emotional state', { error: (err as Error).message });
      }
    }

    return { reply: finalReply, thoughts: extracted.thoughts };
  }
}

export const characterChatService = new CharacterChatService();
