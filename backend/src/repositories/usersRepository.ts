import { query } from '../db/pool.js';
import type { TelegramInitUser } from '../types.js';

export interface UserRecord {
  id: number;
  telegram_user_id: number;
  username: string | null;
  nickname: string | null;
  last_character_id: number | null;
  display_name: string | null;
  gender: string | null;
  language: string;
  voice_person: 1 | 3;
  is_adult_confirmed: boolean;
  last_active_at: string | null;
  created_at: string;
  bonus_messages: number;
}

const mapUser = (row: any): UserRecord => ({
  id: row.id,
  telegram_user_id: Number(row.telegram_user_id),
  username: row.username,
  nickname: row.nickname ?? null,
  last_character_id: row.last_character_id,
  display_name: row.display_name,
  gender: row.gender,
  language: row.language ?? 'ru',
  voice_person: row.voice_person ?? 3,
  is_adult_confirmed: row.is_adult_confirmed ?? false,
  last_active_at: row.last_active_at,
  created_at: row.created_at,
  bonus_messages: row.bonus_messages ?? 0,
});

export const findUserByTelegramId = async (telegramId: number): Promise<UserRecord | null> => {
  const result = await query<UserRecord>('SELECT * FROM users WHERE telegram_user_id = $1 LIMIT 1', [telegramId]);
  return result.rows.length ? mapUser(result.rows[0]) : null;
};

export const findUserById = async (id: number): Promise<UserRecord | null> => {
  const result = await query<UserRecord>('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
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
    // Update username if changed and update last_active_at
    if (payload.username && payload.username !== existing.username) {
      await query('UPDATE users SET username = $1, last_active_at = NOW() WHERE id = $2', [payload.username, existing.id]);
      return { ...existing, username: payload.username };
    }
    // Just update last_active_at
    await query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [existing.id]);
    return existing;
  }
  return createUser(payload);
};

export const updateLastCharacter = async (userId: number, characterId: number | null) => {
  await query('UPDATE users SET last_character_id = $1 WHERE id = $2', [characterId, userId]);
};

/** Update user profile settings */
export interface ProfileUpdate {
  display_name?: string | null;
  nickname?: string | null;
  gender?: string | null;
  language?: string;
  voice_person?: 1 | 3;
}

export const updateUserProfile = async (
  userId: number,
  updates: ProfileUpdate
): Promise<UserRecord> => {
  const setClause: string[] = [];
  const values: any[] = [];
  let paramIndex = 1;

  if (updates.display_name !== undefined) {
    setClause.push(`display_name = $${paramIndex++}`);
    values.push(updates.display_name);
  }
  if (updates.nickname !== undefined) {
    setClause.push(`nickname = $${paramIndex++}`);
    values.push(updates.nickname);
  }
  if (updates.gender !== undefined) {
    setClause.push(`gender = $${paramIndex++}`);
    values.push(updates.gender);
  }
  if (updates.language !== undefined) {
    setClause.push(`language = $${paramIndex++}`);
    values.push(updates.language);
  }
  if (updates.voice_person !== undefined) {
    setClause.push(`voice_person = $${paramIndex++}`);
    values.push(updates.voice_person);
  }

  if (setClause.length === 0) {
    const user = await findUserById(userId);
    if (!user) throw new Error('User not found');
    return user;
  }

  values.push(userId);
  const result = await query<UserRecord>(
    `UPDATE users SET ${setClause.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
    values
  );

  if (!result.rows.length) {
    throw new Error('User not found');
  }
  return mapUser(result.rows[0]);
};

/** Confirm user is 18+ */
export const confirmAdult = async (userId: number): Promise<UserRecord> => {
  const result = await query<UserRecord>(
    'UPDATE users SET is_adult_confirmed = TRUE WHERE id = $1 RETURNING *',
    [userId]
  );
  if (!result.rows.length) {
    throw new Error('User not found');
  }
  return mapUser(result.rows[0]);
};

export interface UserProfile {
  id: number;
  telegramUserId: number;
  username?: string | null;
  nickname?: string | null;
  displayName?: string | null;
  gender?: string | null;
  language: string;
  voicePerson: 1 | 3;
  isAdultConfirmed: boolean;
  lastCharacterId?: number | null;
  subscriptionStatus: 'none' | 'active' | 'expired';
  subscriptionEndAt?: string | null;
  isAdmin: boolean;
  bonusMessages: number;
}

export const buildUserProfile = (
  user: UserRecord,
  subscription: { status: 'none' | 'active' | 'expired'; end_at?: string | null },
  adminTelegramIds: string[] = []
): UserProfile => ({
  id: user.id,
  telegramUserId: user.telegram_user_id,
  username: user.username,
  nickname: user.nickname,
  displayName: user.display_name,
  gender: user.gender,
  language: user.language,
  voicePerson: user.voice_person,
  isAdultConfirmed: user.is_adult_confirmed,
  lastCharacterId: user.last_character_id,
  subscriptionStatus: subscription.status,
  subscriptionEndAt: subscription.end_at ?? null,
  isAdmin: adminTelegramIds.includes(String(user.telegram_user_id)),
  bonusMessages: user.bonus_messages,
});

// ============================================
// Bonus Messages
// ============================================

/** Add bonus messages to user */
export const addBonusMessages = async (userId: number, count: number): Promise<number> => {
  const result = await query<{ bonus_messages: number }>(
    'UPDATE users SET bonus_messages = bonus_messages + $1 WHERE id = $2 RETURNING bonus_messages',
    [count, userId]
  );
  return result.rows[0]?.bonus_messages ?? 0;
};

/** Use 1 bonus message. Returns true if successfully used, false if no bonus messages available */
export const useBonusMessage = async (userId: number): Promise<boolean> => {
  const result = await query(
    'UPDATE users SET bonus_messages = bonus_messages - 1 WHERE id = $1 AND bonus_messages > 0',
    [userId]
  );
  return (result.rowCount ?? 0) > 0;
};

/** Get bonus messages count */
export const getBonusMessages = async (userId: number): Promise<number> => {
  const result = await query<{ bonus_messages: number }>(
    'SELECT bonus_messages FROM users WHERE id = $1',
    [userId]
  );
  return result.rows[0]?.bonus_messages ?? 0;
};

// ============================================
// Dynamic Daily Limits
// ============================================

/**
 * Daily limits based on day number since start:
 * Day 1: 40, Day 2: 25, Day 3: 15, Day 4+: 10
 */
const DAILY_LIMITS = [40, 25, 15, 10] as const;

/**
 * Get daily limit for a given day number (1-indexed)
 */
export const getDailyLimitForDay = (dayNumber: number): number => {
  if (dayNumber <= 0) return DAILY_LIMITS[0];
  if (dayNumber >= DAILY_LIMITS.length) return DAILY_LIMITS[DAILY_LIMITS.length - 1];
  return DAILY_LIMITS[dayNumber - 1];
};

/**
 * Get or initialize limit_start_date for a user.
 * If not set, initializes to today.
 */
export const getOrInitLimitStartDate = async (userId: number): Promise<Date> => {
  // First try to get existing date
  const result = await query<{ limit_start_date: string | null }>(
    'SELECT limit_start_date FROM users WHERE id = $1',
    [userId]
  );

  const existingDate = result.rows[0]?.limit_start_date;
  if (existingDate) {
    return new Date(existingDate);
  }

  // Initialize to today if not set
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await query(
    'UPDATE users SET limit_start_date = $1 WHERE id = $2',
    [today.toISOString().split('T')[0], userId]
  );

  return today;
};

/**
 * Calculate which day number the user is on (1-indexed).
 * Day 1 = limit_start_date, Day 2 = next day, etc.
 */
export const getUserDayNumber = async (userId: number): Promise<number> => {
  const startDate = await getOrInitLimitStartDate(userId);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  startDate.setHours(0, 0, 0, 0);

  const diffMs = today.getTime() - startDate.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  return diffDays + 1; // 1-indexed
};

/**
 * Get the user's current daily message limit based on their day number.
 */
export const getUserDailyLimit = async (userId: number): Promise<{ limit: number; dayNumber: number }> => {
  const dayNumber = await getUserDayNumber(userId);
  const limit = getDailyLimitForDay(dayNumber);
  return { limit, dayNumber };
};
