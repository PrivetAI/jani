import { describe, expect, it } from 'vitest';
import { createHmac } from 'crypto';
import {
  TelegramInitDataError,
  validateTelegramInitData,
  TelegramInitDataValidationResult,
} from '@jani/utils';

type Payload = Record<string, string>;

function buildInitData(payload: Payload, botToken: string): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(payload)) {
    params.append(key, value);
  }
  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

describe('validateTelegramInitData', () => {
  const botToken = '123456:TEST-TOKEN';

  it('accepts valid payloads', () => {
    const payload: Payload = {
      auth_date: '1700000000',
      user: JSON.stringify({ id: 123, first_name: 'Ivan', language_code: 'ru' }),
      query_id: 'AAEAAQ',
    };
    const initData = buildInitData(payload, botToken);

    const result = validateTelegramInitData(initData, {
      botToken,
      maxAgeSeconds: Number.MAX_SAFE_INTEGER,
      currentTimestamp: 1700000000,
    });

    expect(result).toMatchObject<TelegramInitDataValidationResult>({
      authDate: 1700000000,
      user: { id: 123, first_name: 'Ivan', language_code: 'ru' },
    });
  });

  it('rejects payloads with invalid signature', () => {
    const payload: Payload = {
      auth_date: '1700000000',
      user: JSON.stringify({ id: 123, first_name: 'Ivan' }),
      hash: '0'.repeat(64),
    };
    const initData = new URLSearchParams(payload).toString();

    expect(() =>
      validateTelegramInitData(initData, {
        botToken,
        maxAgeSeconds: Number.MAX_SAFE_INTEGER,
        currentTimestamp: 1700000000,
      }),
    ).toThrowError((error: unknown) => {
      return error instanceof TelegramInitDataError && error.code === 'INVALID_SIGNATURE';
    });
  });

  it('rejects payloads with expired auth_date', () => {
    const payload: Payload = {
      auth_date: '100',
      user: JSON.stringify({ id: 1, first_name: 'Ivan' }),
    };
    const initData = buildInitData(payload, botToken);

    expect(() =>
      validateTelegramInitData(initData, {
        botToken,
        maxAgeSeconds: 10,
        currentTimestamp: 200,
      }),
    ).toThrowError((error: unknown) => {
      return error instanceof TelegramInitDataError && error.code === 'EXPIRED';
    });
  });
});
