import type { CharacterRecord } from '../modules/characters.js';
import type { DialogRecord } from '../modules/dialogs.js';
import { getDialogSummary, upsertDialogSummary } from '../modules/dialogSummaries.js';
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
    'Style("короткие 2-4 предложения","флирт и дерзость по месту","используй *действия*")',
    ']',
  ].join('; ');

const buildScenario = (username?: string) =>
  `Scene: приватный чат в Telegram. Пользователь ${
    username ? `@${username}` : 'без ника'
  } общается с персонажем. Настрой: живой, интимный, игривый.`;

const buildFewShotExamples = (characterName: string): LLMMessage[] => [
  {
    role: 'user',
    content: 'Мне скучно, развлеки меня.',
  },
  {
    role: 'assistant',
    content: '*поднимает бровь, улыбается* Развлечь? Легко. Скажи, хочется чего-то нежного или встряски?',
  },
  {
    role: 'user',
    content: 'Ты умеешь говорить откровенно?',
  },
  {
    role: 'assistant',
    content: `Я здесь, чтобы быть откровенной. ${characterName} не прячется за эвфемизмами, я говорю прямо, если ты готов слушать.`,
  },
  {
    role: 'user',
    content: 'Я устал после работы.',
  },
  {
    role: 'assistant',
    content: '*садится рядом, касается плеча* Откинься, я заберу у тебя напряжение. Расскажи, что тебя сегодня бесило больше всего?',
  },
];

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

export class CharacterChatService {
  private startToken = config.chatStartToken;

  private buildStaticMessages(character: CharacterRecord, username?: string, summary?: string | null) {
    const staticMessages: LLMMessage[] = [
      { role: 'system', content: config.driverPrompt },
      { role: 'system', content: buildCharacterCard(character) },
      { role: 'system', content: buildScenario(username) },
    ];

    if (summary) {
      staticMessages.push({
        role: 'system',
        content: `Summarized Past: ${summary}`,
      });
    }

    staticMessages.push({
      role: 'system',
      content: `Start your next answer with this prefill: ${this.startToken} . Не добавляй имя пользователя, не пиши за пользователя.`,
    });

    staticMessages.push(...buildFewShotExamples(character.name));
    return staticMessages;
  }

  private countTokens(messages: LLMMessage[]) {
    return messages.reduce((sum, message) => sum + estimateMessageTokens(message), 0);
  }

  private async summarizeHistory(messages: LLMMessage[], characterName: string) {
    if (!messages.length) {
      return null;
    }
    const transcript = messages
      .map((message) => {
        const speaker = message.role === 'assistant' ? characterName : 'User';
        return `${speaker}: ${message.content}`;
      })
      .join('\n');

    const summaryPrompt: LLMMessage[] = [
      {
        role: 'system',
        content:
          'Кратко перескажи этот диалог в 3 предложениях, сохраняя факты и настроение. Пиши по-русски, без маркировок и без обращения к пользователю.',
      },
      { role: 'user', content: trimTextByTokens(transcript, 700) },
    ];

    try {
      const summary = await llmService.generateReply(summaryPrompt, {
        temperature: config.summaryTemperature,
        topP: config.summaryTopP,
        repetitionPenalty: config.summaryRepetitionPenalty,
        maxTokens: config.summaryMaxTokens,
      });
      return summary.trim();
    } catch (error) {
      logger.error('Failed to summarize dialog', { error: (error as Error).message });
      return null;
    }
  }

  private async updateSummary(userId: number, characterId: number, addition: string | null) {
    if (!addition) {
      return null;
    }
    const existing = await getDialogSummary(userId, characterId);
    const merged = [existing?.summary_text, addition].filter(Boolean).join('\n');
    const trimmed = trimTextByTokens(merged, config.chatSummaryTokenLimit);
    await upsertDialogSummary(userId, characterId, trimmed);
    return trimmed;
  }

  async generateReply(request: ChatRequest): Promise<string> {
    const summaryRecord = await getDialogSummary(request.userId, request.character.id);
    let summary = summaryRecord?.summary_text ?? null;

    const historyMessages = toLLMHistory(request.history);
    const userTurn = buildUserMessage(request.userMessage);

    let staticMessages = this.buildStaticMessages(request.character, request.username, summary);
    let availableForHistory = Math.max(
      estimateMessageTokens(userTurn),
      config.chatTokenBudget - this.countTokens(staticMessages) - config.chatResponseReserve
    );

    let { kept, discarded } = applyHistoryBudget([...historyMessages, userTurn], availableForHistory);

    if (discarded.length) {
      const addition = await this.summarizeHistory(discarded, request.character.name);
      const updated = await this.updateSummary(request.userId, request.character.id, addition);
      summary = updated ?? summary;

      staticMessages = this.buildStaticMessages(request.character, request.username, summary);
      availableForHistory = Math.max(
        estimateMessageTokens(userTurn),
        config.chatTokenBudget - this.countTokens(staticMessages) - config.chatResponseReserve
      );
      ({ kept } = applyHistoryBudget([...historyMessages, userTurn], availableForHistory));
    }

    const messages: LLMMessage[] = this.buildStaticMessages(request.character, request.username, summary);
    messages.push(...kept);

    const rawReply = await llmService.generateReply(messages, {
      temperature: config.chatTemperature,
      topP: config.chatTopP,
      repetitionPenalty: config.chatRepetitionPenalty,
      maxTokens: config.chatResponseReserve,
      stop: config.chatStopSequences,
    });

    const replyWithPrefill = rawReply.startsWith(this.startToken)
      ? rawReply
      : `${this.startToken}${rawReply}`;

    return sanitizeReply(replyWithPrefill, request.character.name, request.username);
  }
}

export const characterChatService = new CharacterChatService();
