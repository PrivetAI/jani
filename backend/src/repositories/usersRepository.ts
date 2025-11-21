import { query } from '../db/pool.js';
import type { TelegramInitUser } from '../types.js';

export interface UserRecord {
  id: number;
  telegram_user_id: number;
  username: string | null;
  last_character_id: number | null;
  created_at: string;
}

const mapUser = (row: any): UserRecord => ({
  id: row.id,
  telegram_user_id: Number(row.telegram_user_id),
  username: row.username,
  last_character_id: row.last_character_id,
  created_at: row.created_at,
});

export const findUserByTelegramId = async (telegramId: number): Promise<UserRecord | null> => {
  const result = await query<UserRecord>('SELECT * FROM users WHERE telegram_user_id = $1 LIMIT 1', [telegramId]);
  return result.rows.length ? mapUser(result.rows[0]) : null;
};

export const createUser = async (payload: TelegramInitUser): Promise<UserRecord> => {
  const result = await query<UserRecord>(
    'INSERT INTO users (telegram_user_id, username) VALUES ($1, $2) RETURNING *',
    [payload.id, payload.username ?? null]
  );
  return mapUser(result.rows[0]);
};

export const findOrCreateUser = async (payload: TelegramInitUser): Promise<UserRecord> => {
  const existing = await findUserByTelegramId(payload.id);
  if (existing) {
    if (payload.username && payload.username !== existing.username) {
      await query('UPDATE users SET username = $1 WHERE id = $2', [payload.username, existing.id]);
      return { ...existing, username: payload.username };
    }
    return existing;
  }
  return createUser(payload);
};

export const updateLastCharacter = async (userId: number, characterId: number | null) => {
  await query('UPDATE users SET last_character_id = $1 WHERE id = $2', [characterId, userId]);
};

export interface UserProfile {
  id: number;
  telegramUserId: number;
  username?: string | null;
  lastCharacterId?: number | null;
  subscriptionStatus: 'none' | 'active' | 'expired';
  subscriptionEndAt?: string | null;
}

export const buildUserProfile = (
  user: UserRecord,
  subscription: { status: 'none' | 'active' | 'expired'; end_at?: string | null }
): UserProfile => ({
  id: user.id,
  telegramUserId: user.telegram_user_id,
  username: user.username,
  lastCharacterId: user.last_character_id,
  subscriptionStatus: subscription.status,
  subscriptionEndAt: subscription.end_at ?? null,
});
