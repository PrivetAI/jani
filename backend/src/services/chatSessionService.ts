import { config } from '../config.js';
import { logger } from '../logger.js';
import { addDialogMessage, countUserMessagesToday, getDialogHistory, getLastCharacterForUser, getCharacterById, type CharacterRecord, findOrCreateUser, updateLastCharacter, type UserRecord, getActiveSubscription } from '../modules/index.js';
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

    const history = await getDialogHistory(user.id, character.id, 60);
    await addDialogMessage(user.id, character.id, 'user', request.messageText);
    await updateLastCharacter(user.id, character.id);

    try {
      const result = await characterChatService.generateReply({
        userId: user.id,
        username: user.username ?? request.username,
        userDisplayName: user.display_name ?? undefined,
        userGender: user.gender ?? undefined,
        character,
        userMessage: request.messageText,
        history,
      });

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
