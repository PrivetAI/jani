import { describe, expect, it } from 'vitest';
import type { Character, Dialog } from '@jani/shared';
import { CharacterStatus, CharacterVisibility, DialogStatus, MessageRole } from '@jani/shared';
import { buildPromptMessages } from '../prompt';

const createCharacter = (): Character => ({
  id: 'char1',
  slug: 'detective',
  name: 'Детектив',
  visibility: CharacterVisibility.Public,
  status: CharacterStatus.Live,
  createdBy: null,
  versions: [
    {
      id: 'ver1',
      characterId: 'char1',
      systemPrompt: 'Соблюдай нуарную подачу.',
      style: {},
      safetyPolicy: {},
      modelPreset: { model: 'openrouter/auto', temperature: 0.6 },
      version: 1,
      isActive: true,
      createdAt: new Date(),
    },
  ],
  stories: [
    {
      id: 'story1',
      characterId: 'char1',
      title: 'Приют-13',
      arcJson: { nodes: [{ node_id: '1', text_ru: 'Таинственный коридор.' }] },
      isPremium: false,
    },
  ],
});

const createDialog = (): Dialog => ({
  id: 'dialog1',
  userId: 'user1',
  characterId: 'char1',
  storyId: 'story1',
  status: DialogStatus.Open,
  summary: null,
  modelOverride: null,
  createdAt: new Date(),
  messages: [],
});

describe('buildPromptMessages', () => {
  it('includes summary, memory and exactly four history pairs', () => {
    const dialog = createDialog();
    dialog.messages = [
      {
        id: 'm1',
        dialogId: dialog.id,
        role: MessageRole.User,
        content: 'Привет',
        tokensIn: null,
        tokensOut: null,
        createdAt: new Date(),
      },
      {
        id: 'm2',
        dialogId: dialog.id,
        role: MessageRole.Assistant,
        content: 'Здравствуйте, чем помочь?',
        tokensIn: null,
        tokensOut: null,
        createdAt: new Date(),
      },
    ];
    const character = createCharacter();
    const messages = buildPromptMessages(
      {
        dialog,
        character,
        summary: 'Клиент ищет исчезнувшую сестру.',
        memoryFacts: ['Любит кофе без сахара'],
        lastPairs: [
          { user: 'Привет', assistant: 'Здравствуйте, чем помочь?' },
          { user: 'Где моя сестра?', assistant: 'Расскажите детали.' },
        ],
      },
      'Она исчезла вчера.',
    );

    expect(messages[0].role).toBe('system');
    expect(messages[0].content).toContain('Клиент ищет исчезнувшую сестру');
    expect(messages[0].content).toContain('Любит кофе без сахара');
    const userMessages = messages.filter((message) => message.role === 'user');
    expect(userMessages.length).toBe(5); // 4 пары + текущий запрос
    expect(userMessages[userMessages.length - 1].content).toBe('Она исчезла вчера.');
  });
});
