import { query } from '../db/pool.js';

export interface DialogSummaryRecord {
  user_id: number;
  character_id: number;
  summary_text: string;
  updated_at: string;
}

const mapDialogSummary = (row: any): DialogSummaryRecord => ({
  user_id: row.user_id,
  character_id: row.character_id,
  summary_text: row.summary_text,
  updated_at: row.updated_at,
});

export const getDialogSummary = async (
  userId: number,
  characterId: number
): Promise<DialogSummaryRecord | null> => {
  const result = await query<DialogSummaryRecord>(
    'SELECT * FROM dialog_summaries WHERE user_id = $1 AND character_id = $2 LIMIT 1',
    [userId, characterId]
  );
  return result.rows.length ? mapDialogSummary(result.rows[0]) : null;
};

export const upsertDialogSummary = async (
  userId: number,
  characterId: number,
  summary: string
) => {
  const result = await query<DialogSummaryRecord>(
    `INSERT INTO dialog_summaries (user_id, character_id, summary_text)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, character_id)
     DO UPDATE SET summary_text = EXCLUDED.summary_text, updated_at = NOW()
     RETURNING *`,
    [userId, characterId, summary]
  );
  return mapDialogSummary(result.rows[0]);
};

export const clearDialogSummary = async (userId: number, characterId: number) => {
  await query('DELETE FROM dialog_summaries WHERE user_id = $1 AND character_id = $2', [userId, characterId]);
};
