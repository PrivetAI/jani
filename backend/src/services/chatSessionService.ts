import { config } from '../config.js';
import { logger } from '../logger.js';
import { addDialogMessage, countUserMessagesToday, getDialogHistory, getLastCharacterForUser, getCharacterById, type CharacterRecord, findOrCreateUser, updateLastCharacter, type UserRecord, getActiveSubscription } from '../modules/index.js';
import { getSession } from '../repositories/sessionsRepository.js';
import { characterChatService } from './characterChatService.js';
import {
  CharacterInactiveError,
  CharacterRequiredError,
  LimitReachedError,
  LLMGenerationError,
  PremiumRequiredError,
} from '../errors.js';

export interface ChatResult {
  reply: string;
  character: CharacterRecord;
  userId: number;
}

export interface ChatRequest {
  telegramUserId: number;
  username?: string;
  messageText: string;
  characterId?: number | null;
  isRegenerate?: boolean;
}

export class ChatSessionService {
  private async resolveCharacterId(user: UserRecord, explicitId?: number | null) {
    if (typeof explicitId === 'number') {
      return explicitId;
    }
    if (user.last_character_id) {
      return user.last_character_id;
    }
    return getLastCharacterForUser(user.id);
  }

  async processMessage(request: ChatRequest): Promise<ChatResult> {
    const user = await findOrCreateUser({ id: request.telegramUserId, username: request.username });
    const subscription = await getActiveSubscription(user.id);
    const characterId = await this.resolveCharacterId(user, request.characterId);


    if (!characterId) {
      throw new CharacterRequiredError();
    }

    const character = await getCharacterById(characterId);
    if (!character || !character.is_active) {
      throw new CharacterInactiveError(characterId);
    }

    const hasSubscription = Boolean(subscription);
    if (character.access_type === 'premium' && !hasSubscription) {
      throw new PremiumRequiredError(character.id);
    }

    if (!hasSubscription && config.enableMessageLimit) {
      const used = await countUserMessagesToday(user.id);
      if (used >= config.freeDailyMessageLimit) {
        throw new LimitReachedError(used, config.freeDailyMessageLimit);
      }
    }

    const historyResult = await getDialogHistory(user.id, character.id, { limit: 60 });
    const history = historyResult.messages;
    // Note: user message is saved AFTER successful LLM response (inside try block)
    await updateLastCharacter(user.id, character.id);

    // Get user's session LLM settings
    const session = await getSession(user.id, character.id);
    let sessionLlmSettings: { model?: string | null; temperature?: number | null; topP?: number | null; provider?: string | null } | undefined;

    if (session && session.llm_model) {
      // Lookup provider from allowed_models table
      const { query } = await import('../db/pool.js');
      const modelResult = await query<{ provider: string }>(
        'SELECT provider FROM allowed_models WHERE model_id = $1',
        [session.llm_model]
      );
      const resolvedProvider = modelResult.rows[0]?.provider ?? null;

      sessionLlmSettings = {
        model: session.llm_model,
        temperature: session.llm_temperature,
        topP: session.llm_top_p,
        provider: resolvedProvider,
      };
    } else if (session) {
      sessionLlmSettings = {
        model: session.llm_model,
        temperature: session.llm_temperature,
        topP: session.llm_top_p,
      };
    }

    try {
      const result = await characterChatService.generateReply({
        userId: user.id,
        username: user.username ?? request.username,
        userDisplayName: user.display_name ?? undefined,
        userGender: user.gender ?? undefined,
        voicePerson: user.voice_person,
        character,
        userMessage: request.messageText,
        history,
        sessionLlmSettings,
        isRegenerate: request.isRegenerate,
      });

      // Save user message only after successful LLM response (skip for regenerate)
      if (!request.isRegenerate) {
        await addDialogMessage(user.id, character.id, 'user', request.messageText);
      }

      // Save only clean reply to history (no thoughts)
      await addDialogMessage(user.id, character.id, 'assistant', result.reply);

      // Memory extraction now happens inline in characterChatService (no async call needed)

      // Return both reply and thoughts for UI
      const fullReply = result.thoughts
        ? `${result.reply}\n\n${result.thoughts}`
        : result.reply;

      return { reply: fullReply, character, userId: user.id };
    } catch (error) {
      logger.error('ChatSession LLM error', { error: (error as Error).message });
      throw new LLMGenerationError((error as Error).message);
    }
  }
}

export const chatSessionService = new ChatSessionService();
