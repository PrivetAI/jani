import { createHmac, timingSafeEqual } from 'crypto';

export type TelegramInitDataErrorCode =
  | 'MISSING_HASH'
  | 'INVALID_SIGNATURE'
  | 'EXPIRED'
  | 'INVALID_AUTH_DATE'
  | 'MISSING_AUTH_DATE'
  | 'CONFIGURATION';

export class TelegramInitDataError extends Error {
  public readonly code: TelegramInitDataErrorCode;

  constructor(code: TelegramInitDataErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export interface TelegramWebAppUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  allows_write_to_pm?: boolean;
  photo_url?: string;
}

export interface TelegramInitDataValidationOptions {
  botToken?: string;
  secretKey?: string | Buffer;
  maxAgeSeconds?: number;
  currentTimestamp?: number;
}

export interface TelegramInitDataValidationResult {
  raw: Record<string, string>;
  authDate: number;
  hash: string;
  user?: TelegramWebAppUser;
}

type InitDataInput =
  | string
  | URLSearchParams
  | Record<string, string | number | boolean | undefined | null>;

function normaliseInitData(input: InitDataInput): URLSearchParams {
  if (typeof input === 'string') {
    return new URLSearchParams(input);
  }
  if (input instanceof URLSearchParams) {
    return new URLSearchParams(input.toString());
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined || value === null) {
      continue;
    }
    params.append(key, String(value));
  }
  return params;
}

function resolveSecretKey(options: TelegramInitDataValidationOptions): Buffer {
  if (options.secretKey) {
    if (typeof options.secretKey === 'string') {
      const trimmed = options.secretKey.trim();
      if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
        return Buffer.from(trimmed, 'hex');
      }
      return Buffer.from(trimmed, 'utf8');
    }
    return Buffer.from(options.secretKey);
  }
  if (options.botToken) {
    return createHmac('sha256', 'WebAppData').update(options.botToken).digest();
  }
  throw new TelegramInitDataError('CONFIGURATION', 'Telegram init data secret is not configured');
}

function buildDataCheckString(params: URLSearchParams): string {
  return Array.from(params.entries())
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

export function validateTelegramInitData(
  initData: InitDataInput,
  options: TelegramInitDataValidationOptions,
): TelegramInitDataValidationResult {
  const params = normaliseInitData(initData);
  const raw = Object.fromEntries(params.entries());
  const hash = params.get('hash');

  if (!hash) {
    throw new TelegramInitDataError('MISSING_HASH', 'hash is required in initData');
  }

  const secretKey = resolveSecretKey(options);
  const dataCheckString = buildDataCheckString(params);
  const hmac = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  const provided = Buffer.from(hash, 'hex');
  const expected = Buffer.from(hmac, 'hex');

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    throw new TelegramInitDataError('INVALID_SIGNATURE', 'Invalid Telegram initData signature');
  }

  const authDateRaw = params.get('auth_date');
  if (!authDateRaw) {
    throw new TelegramInitDataError('MISSING_AUTH_DATE', 'auth_date is required in initData');
  }
  const authDate = Number(authDateRaw);
  if (!Number.isFinite(authDate)) {
    throw new TelegramInitDataError('INVALID_AUTH_DATE', 'auth_date must be a number');
  }

  const now = options.currentTimestamp ?? Math.floor(Date.now() / 1000);
  if (options.maxAgeSeconds !== undefined && options.maxAgeSeconds >= 0) {
    if (now - authDate > options.maxAgeSeconds) {
      throw new TelegramInitDataError('EXPIRED', 'Telegram initData has expired');
    }
  }

  let user: TelegramWebAppUser | undefined;
  const userRaw = raw['user'];
  if (typeof userRaw === 'string') {
    try {
      user = JSON.parse(userRaw) as TelegramWebAppUser;
    } catch {
      // Ignore JSON parse errors — we simply do not expose user payload.
    }
  }

  return {
    raw,
    authDate,
    hash,
    user,
  };
}
