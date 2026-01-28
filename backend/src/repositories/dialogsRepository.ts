import { query } from '../db/pool.js';

export interface DialogRecord {
  id: number;
  user_id: number;
  character_id: number;
  role: 'user' | 'assistant';
  message_text: string;
  created_at: string;
}

const mapDialog = (row: any): DialogRecord => ({
  id: row.id,
  user_id: row.user_id,
  character_id: row.character_id,
  role: row.role,
  message_text: row.message_text,
  created_at: row.created_at,
});

export const addDialogMessage = async (
  userId: number,
  characterId: number,
  role: 'user' | 'assistant',
  message: string
) => {
  await query(
    'INSERT INTO dialogs (user_id, character_id, role, message_text) VALUES ($1, $2, $3, $4)',
    [userId, characterId, role, message]
  );
};

export const getRecentDialogMessages = async (
  userId: number,
  characterId: number,
  limitPairs = 4
) => {
  const limit = limitPairs * 2;
  const result = await query<DialogRecord>(
    `SELECT * FROM dialogs
     WHERE user_id = $1 AND character_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, characterId, limit]
  );

  return result.rows.map(mapDialog).reverse();
};

export const countUserMessagesToday = async (userId: number) => {
  const result = await query<{ count: string }>(
    `SELECT COUNT(*) FROM dialogs
     WHERE user_id = $1
       AND role = 'user'
       AND created_at >= date_trunc('day', NOW())`,
    [userId]
  );
  return Number(result.rows[0]?.count ?? 0);
};

export interface DialogHistoryOptions {
  limit?: number;
  before?: string; // cursor: ISO date string of oldest message in current view
}

export interface DialogHistoryResult {
  messages: DialogRecord[];
  hasMore: boolean;
  nextCursor: string | null;
}

export const getDialogHistory = async (
  userId: number,
  characterId: number,
  options: DialogHistoryOptions = {}
): Promise<DialogHistoryResult> => {
  const limit = options.limit ?? 20;
  const fetchLimit = limit + 1; // Fetch one extra to check if there are more

  let result;
  if (options.before) {
    result = await query<DialogRecord>(
      `SELECT * FROM dialogs
       WHERE user_id = $1 AND character_id = $2 AND created_at < $3
       ORDER BY created_at DESC
       LIMIT $4`,
      [userId, characterId, options.before, fetchLimit]
    );
  } else {
    result = await query<DialogRecord>(
      `SELECT * FROM dialogs
       WHERE user_id = $1 AND character_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [userId, characterId, fetchLimit]
    );
  }

  const hasMore = result.rows.length > limit;
  const rows = hasMore ? result.rows.slice(0, limit) : result.rows;
  const messages = rows.map(mapDialog).reverse();
  const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1].created_at : null;

  return { messages, hasMore, nextCursor };
};

export const getLastCharacterForUser = async (userId: number): Promise<number | null> => {
  const result = await query<{ character_id: number }>(
    `SELECT character_id FROM dialogs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.character_id ?? null;
};

export const getLastAssistantMessage = async (
  userId: number,
  characterId: number
): Promise<DialogRecord | null> => {
  const result = await query<DialogRecord>(
    `SELECT * FROM dialogs
     WHERE user_id = $1 AND character_id = $2 AND role = 'assistant'
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, characterId]
  );
  return result.rows[0] ? mapDialog(result.rows[0]) : null;
};

export const deleteDialogMessage = async (messageId: number): Promise<boolean> => {
  const result = await query(
    'DELETE FROM dialogs WHERE id = $1',
    [messageId]
  );
  return (result.rowCount ?? 0) > 0;
};
