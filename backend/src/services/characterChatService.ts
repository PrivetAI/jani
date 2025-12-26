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
  buildHighlights,
  buildMemoryBlock,
  trimTextByTokens,
  buildCharacterCard,
  buildUserFacts,
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
  private readonly conversationWindow = 8; // 4 реплики пользователя + 4 ассистента

  private buildSystemPrompt(
    character: CharacterRecord,
    userInfo?: string | null,
    memory?: string | null,
    userFacts?: string | null,
    emotionalContext?: string | null
  ): string {
    const parts: string[] = [
      config.driverPrompt,
      '',
      buildCharacterCard(character),
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
    userInfo?: string | null,
    memory?: string | null,
    userFacts?: string | null,
    emotionalContext?: string | null
  ): LLMMessage[] {
    const systemPrompt = this.buildSystemPrompt(character, userInfo, memory, userFacts, emotionalContext);
    return [{ role: 'system', content: systemPrompt }];
  }

  private countTokens(messages: LLMMessage[]) {
    return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
  }

  private async summarizeHistory(
    messages: LLMMessage[],
    characterName: string,
    existingSummary?: string | null,
    provider: 'openrouter' | 'gemini' = 'openrouter'
  ): Promise<{ summary: string | null; facts: Array<{ content: string; category: string; importance: number }> }> {
    const emptyResult = { summary: null, facts: [] };

    if (!messages.length && !existingSummary) {
      return emptyResult;
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
        content: SUMMARY_AND_FACTS_PROMPT,
      },
      { role: 'user', content: trimTextByTokens(summarySource, 900) },
    ];

    try {
      const rawResponse = await llmService.generateReply(summaryPrompt, {
        temperature: config.summaryTemperature,
        topP: config.summaryTopP,
        repetitionPenalty: config.summaryRepetitionPenalty,
        maxTokens: config.summaryMaxTokens,
        provider,
      });


      // Parse JSON - look for object with summary field
      const jsonMatch = rawResponse.match(/\{[\s\S]*"summary"[\s\S]*\}/);

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          const summary = parsed.summary && typeof parsed.summary === 'string'
            ? parsed.summary.trim()
            : null;

          // Parse facts array
          const facts = Array.isArray(parsed.facts)
            ? parsed.facts.filter((f: any) =>
              f.content &&
              typeof f.content === 'string' &&
              f.content.length > 3 &&
              f.content.length < 200 &&
              ['fact', 'preference', 'emotion', 'relationship'].includes(f.category) &&
              typeof f.importance === 'number' &&
              f.importance >= 1 && f.importance <= 10
            ).slice(0, 3)
            : [];

          return { summary, facts };
        } catch (e) {
          logger.warn('Failed to parse summary+facts JSON', { error: (e as Error).message });
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

  async generateReply(request: ChatRequest): Promise<string> {
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

    // Resolve provider and model
    const provider = (request.character.llm_provider as 'openrouter' | 'gemini') || 'openrouter';
    const model = request.character.llm_model || undefined;

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
        const result = await this.summarizeHistory(messagesToSummarize, request.character.name, existingSummary, provider);
        if (result.summary) {
          promptSummary = result.summary;
          await this.updateSummary(request.userId, request.character.id, result.summary, nextSummaryThreshold);

          // Save facts extracted in the same LLM call (no separate call needed!)
          if (result.facts.length > 0) {
            const { addMemory, getMemories } = await import('../modules/index.js');
            const existingMemories = await getMemories(request.userId, request.character.id);
            const existingContents = existingMemories.map(m => m.content.toLowerCase());

            let savedCount = 0;
            for (const fact of result.facts) {
              const isDuplicate = existingContents.some(existing =>
                existing.includes(fact.content.toLowerCase()) ||
                fact.content.toLowerCase().includes(existing)
              );
              if (!isDuplicate) {
                await addMemory(request.userId, request.character.id, fact.content, fact.category as any, fact.importance);
              }
            }
          }
        }
      }
    }

    const highlights = buildHighlights(windowMessages, request.character.name, request.username);
    const memoryBlock = buildMemoryBlock(promptSummary, highlights);

    let staticMessages = this.buildStaticMessages(request.character, userInfo, memoryBlock, userFacts, emotionalContext);
    let staticTokens = this.countTokens(staticMessages);


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

    if (discarded.length) {
      const overflowResult = await this.summarizeHistory(discarded, request.character.name, promptSummary, provider);
      promptSummary = overflowResult.summary ?? promptSummary;

      staticMessages = this.buildStaticMessages(request.character, userInfo, buildMemoryBlock(promptSummary, highlights), userFacts, emotionalContext);
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


    const rawReply = await llmService.generateReply(messages, {
      model,
      provider,
      temperature: request.character.llm_temperature ?? config.chatTemperature,
      topP: request.character.llm_top_p ?? config.chatTopP,
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

    // Include thoughts in reply if present (for UI display)
    let replyWithThoughts = finalReply;
    if (extracted.thoughts) {
      replyWithThoughts = `${finalReply}\n\n${extracted.thoughts}`;
    }


    return replyWithThoughts;
  }
}

export const characterChatService = new CharacterChatService();
