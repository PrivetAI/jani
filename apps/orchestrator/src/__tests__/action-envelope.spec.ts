import { describe, expect, it } from 'vitest';
import { parseActionEnvelope } from '@jani/utils';

const sample = JSON.stringify({
  user_visible_text: 'Готов продолжать расследование.',
  actions: [{ type: 'OFFER_ITEM', item_slug: 'memory-crystal', reason_ru: 'Поможет вспомнить детали.' }],
  summary: 'Обсудили план действий.',
});

describe('parseActionEnvelope', () => {
  it('parses envelope JSON', () => {
    const envelope = parseActionEnvelope(sample);
    expect(envelope.user_visible_text).toContain('Готов');
    expect(envelope.actions[0].type).toBe('OFFER_ITEM');
    expect(envelope.summary).toBe('Обсудили план действий.');
  });

  it('throws for invalid payload', () => {
    expect(() => parseActionEnvelope('{"foo":"bar"}')).toThrowError();
  });
});
