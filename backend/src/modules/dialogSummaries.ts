import { query } from '../db/pool.js';

export interface DialogSummaryRecord {
  user_id: number;
  character_id: number;
  summary_text: string;
  summarized_message_count: number;
  updated_at: string;
}

const mapDialogSummary = (row: any): DialogSummaryRecord => ({
  user_id: row.user_id,
  character_id: row.character_id,
  summary_text: row.summary_text,
  summarized_message_count: row.summarized_message_count ?? 0,
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
  summary: string,
  summarizedMessageCount: number
) => {
  const result = await query<DialogSummaryRecord>(
    `INSERT INTO dialog_summaries (user_id, character_id, summary_text, summarized_message_count)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, character_id)
     DO UPDATE SET summary_text = EXCLUDED.summary_text, 
                   summarized_message_count = EXCLUDED.summarized_message_count,
                   updated_at = NOW()
     RETURNING *`,
    [userId, characterId, summary, summarizedMessageCount]
  );
  return mapDialogSummary(result.rows[0]);
};

export const clearDialogSummary = async (userId: number, characterId: number) => {
  await query('DELETE FROM dialog_summaries WHERE user_id = $1 AND character_id = $2', [userId, characterId]);
};
