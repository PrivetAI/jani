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

export const getDialogHistory = async (userId: number, characterId: number, limit = 20) => {
  const result = await query<DialogRecord>(
    `SELECT * FROM dialogs
     WHERE user_id = $1 AND character_id = $2
     ORDER BY created_at DESC
     LIMIT $3`,
    [userId, characterId, limit]
  );
  return result.rows.map(mapDialog).reverse();
};

export const getLastCharacterForUser = async (userId: number): Promise<number | null> => {
  const result = await query<{ character_id: number }>(
    `SELECT character_id FROM dialogs WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  return result.rows[0]?.character_id ?? null;
};
