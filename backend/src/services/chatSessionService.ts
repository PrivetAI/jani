import { config } from '../config.js';
import { logger } from '../logger.js';
import { addDialogMessage, countUserMessagesToday, getDialogHistory, getLastCharacterForUser } from '../modules/dialogs.js';
import { getCharacterById, type CharacterRecord } from '../modules/characters.js';
import { findOrCreateUser, updateLastCharacter, type UserRecord } from '../modules/users.js';
import { getActiveSubscription } from '../modules/subscriptions.js';
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
  private preview(text: string | undefined | null, limit = 120) {
    if (!text) return '';
    return text.length > limit ? `${text.slice(0, limit)}…` : text;
  }

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

    logger.info('ChatSession start', {
      userId: user.id,
      username: user.username ?? request.username,
      characterId,
      hasSubscription: Boolean(subscription),
      messagePreview: this.preview(request.messageText),
    });

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

    if (!hasSubscription) {
      const used = await countUserMessagesToday(user.id);
      if (used >= config.freeDailyMessageLimit) {
        throw new LimitReachedError(used, config.freeDailyMessageLimit);
      }
      logger.info('ChatSession usage check', {
        userId: user.id,
        usedToday: used,
        dailyLimit: config.freeDailyMessageLimit,
      });
    }

    const history = await getDialogHistory(user.id, character.id, 60);
    logger.info('ChatSession history loaded', {
      userId: user.id,
      characterId: character.id,
      historyCount: history.length,
      lastRoles: history.slice(-3).map((item) => item.role),
    });
    await addDialogMessage(user.id, character.id, 'user', request.messageText);
    await updateLastCharacter(user.id, character.id);

    try {
      const reply = await characterChatService.generateReply({
        userId: user.id,
        username: user.username ?? request.username,
        character,
        userMessage: request.messageText,
        history,
      });
      await addDialogMessage(user.id, character.id, 'assistant', reply);
      logger.info('ChatSession reply stored', {
        userId: user.id,
        characterId: character.id,
        replyPreview: this.preview(reply, 160),
      });

      // Memory extraction now happens inline in characterChatService (no async call needed)

      return { reply, character, userId: user.id };
    } catch (error) {
      logger.error('ChatSession LLM error', { error: (error as Error).message });
      throw new LLMGenerationError((error as Error).message);
    }
  }
}

export const chatSessionService = new ChatSessionService();
