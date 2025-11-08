import { Character, Dialog, StoryNode } from '@jani/shared';
import { OpenRouterMessage } from '@jani/utils';

export interface PromptContext {
  dialog: Dialog;
  character: Character;
  summary: string;
  memoryFacts: string[];
  lastPairs: Array<{ user: string; assistant: string }>;
}

const STORY_NODE_LIMIT = 3;

const extractStoryContext = (character: Character, dialog: Dialog): string => {
  const story = dialog.storyId ? character.stories.find((item) => item.id === dialog.storyId) : null;
  if (!story) {
    return '';
  }
  const nodes = Array.isArray((story.arcJson as { nodes?: StoryNode[] } | undefined)?.nodes)
    ? ((story.arcJson as { nodes?: StoryNode[] }).nodes as StoryNode[])
    : [];
  const nodeTexts = nodes
    .slice(0, STORY_NODE_LIMIT)
    .map((node) => node?.text_ru)
    .filter((text): text is string => Boolean(text));
  const lines = [`История: ${story.title}.`];
  if (nodeTexts.length) {
    lines.push(`Контекст: ${nodeTexts.join(' / ')}`);
  }
  return lines.join('\n');
};

const padPairs = (pairs: Array<{ user: string; assistant: string }>): Array<{ user: string; assistant: string }> => {
  const sliced = pairs.slice(-4);
  const result = [...sliced];
  while (result.length < 4) {
    result.unshift({ user: '', assistant: '' });
  }
  return result;
};

export const buildPromptMessages = (context: PromptContext, userText: string): OpenRouterMessage[] => {
  const activeVersion = context.character.versions.find((version) => version.isActive) ?? context.character.versions[0];
  if (!activeVersion) {
    throw new Error(`Character ${context.character.id} has no versions`);
  }
  const storyLine = extractStoryContext(context.character, context.dialog);
  const memoryBlock = context.memoryFacts.length ? `Актуальные факты памяти:\n- ${context.memoryFacts.join('\n- ')}` : '';
  const summaryBlock = context.summary ? `Резюме беседы:\n${context.summary}` : '';
  const instructions = [
    `Ты играешь персонажа ${context.character.name}. Соблюдай стиль и систему:`,
    activeVersion.systemPrompt,
    storyLine,
    summaryBlock,
    memoryBlock,
    'Ответ должен быть JSON объектом с полями user_visible_text, actions (массив), summary. user_visible_text — чистый текст на русском.',
    'Если нечего добавить, оставляй массив действий пустым. Действия описывают офферы, потребление предметов и флаги.',
  ]
    .filter(Boolean)
    .join('\n\n');
  const messages: OpenRouterMessage[] = [{ role: 'system', content: instructions }];
  const paddedPairs = padPairs(context.lastPairs);
  for (const pair of paddedPairs) {
    messages.push({ role: 'user', content: pair.user || '(нет сообщения пользователя)' });
    if (pair.assistant) {
      messages.push({ role: 'assistant', content: pair.assistant });
    }
  }
  messages.push({ role: 'user', content: userText });
  return messages;
};
