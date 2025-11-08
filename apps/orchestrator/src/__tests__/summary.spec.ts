import { describe, expect, it } from 'vitest';
import { Dialog, DialogStatus, MessageRole } from '@jani/shared';
import { reduceDialogSummary } from '../summary';

const createDialogWithMessages = (messages: Array<{ role: MessageRole; content: string }>): Dialog => ({
  id: 'd1',
  userId: 'u1',
  characterId: 'c1',
  storyId: null,
  status: DialogStatus.Open,
  summary: null,
  modelOverride: null,
  createdAt: new Date(),
  messages: messages.map((message, index) => ({
    id: `m${index}`,
    dialogId: 'd1',
    role: message.role,
    content: message.content,
    tokensIn: null,
    tokensOut: null,
    createdAt: new Date(),
  })),
});

describe('reduceDialogSummary', () => {
  it('appends new messages to previous summary', () => {
    const previous = 'Пользователь: Ранее обсуждали дело.';
    const dialog = createDialogWithMessages([
      { role: MessageRole.User, content: 'Как продвигается расследование?' },
      { role: MessageRole.Assistant, content: 'Нашли новую улику.' },
    ]);
    const summary = reduceDialogSummary(previous, dialog);
    expect(summary).toContain('Пользователь: Ранее обсуждали дело.');
    expect(summary).toContain('Пользователь: Как продвигается расследование?');
    expect(summary).toContain('Ассистент: Нашли новую улику.');
  });

  it('trims summary to max length', () => {
    const longPrevious = 'x'.repeat(2000);
    const dialog = createDialogWithMessages([{ role: MessageRole.User, content: 'Привет' }]);
    const summary = reduceDialogSummary(longPrevious, dialog);
    expect(summary.length).toBeLessThanOrEqual(1024);
    expect(summary).toContain('Привет');
  });
});
