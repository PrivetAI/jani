import crypto from 'node:crypto';
import { TelegramInitData } from '../types.js';

const buildDataCheckString = (params: URLSearchParams): string => {
  return Array.from(params.entries())
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n');
};

export const parseInitData = (initData: string, botToken: string, skipHashValidation = false): TelegramInitData => {
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) {
    throw new Error('Init data missing hash');
  }

  params.delete('hash');
  const dataCheckString = buildDataCheckString(params);

  if (!skipHashValidation) {
    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
    if (expectedHash !== hash) {
      throw new Error('Invalid Telegram init data hash');
    }
  }

  const userRaw = params.get('user');
  if (!userRaw) {
    throw new Error('Init data missing user');
  }

  const parsedUser = JSON.parse(userRaw);

  return {
    user: parsedUser,
    query_id: params.get('query_id') ?? undefined,
    auth_date: params.get('auth_date') ?? '',
    hash,
  };
};
