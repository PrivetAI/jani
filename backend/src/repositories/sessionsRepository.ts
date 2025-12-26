import { query } from '../db/pool.js';

export interface ChatSessionRecord {
    id: number;
    user_id: number;
    character_id: number;
    last_message_at: string | null;
    messages_count: number;
    created_at: string;
    llm_model: string | null;
}

const mapSession = (row: any): ChatSessionRecord => ({
    id: row.id,
    user_id: row.user_id,
    character_id: row.character_id,
    last_message_at: row.last_message_at,
    messages_count: row.messages_count,
    created_at: row.created_at,
    llm_model: row.llm_model ?? null,
});

/** Get or create a chat session for user-character pair */
export const getOrCreateSession = async (
    userId: number,
    characterId: number
): Promise<ChatSessionRecord> => {
    // Try to find existing session
    const existing = await query<ChatSessionRecord>(
        'SELECT * FROM chat_sessions WHERE user_id = $1 AND character_id = $2',
        [userId, characterId]
    );

    if (existing.rows.length > 0) {
        return mapSession(existing.rows[0]);
    }

    // Create new session
    const result = await query<ChatSessionRecord>(
        `INSERT INTO chat_sessions (user_id, character_id)
     VALUES ($1, $2)
     RETURNING *`,
        [userId, characterId]
    );
    return mapSession(result.rows[0]);
};

/** Get session by ID */
export const getSessionById = async (
    sessionId: number
): Promise<ChatSessionRecord | null> => {
    const result = await query<ChatSessionRecord>(
        'SELECT * FROM chat_sessions WHERE id = $1',
        [sessionId]
    );
    return result.rows.length ? mapSession(result.rows[0]) : null;
};

/** Get session by user and character */
export const getSession = async (
    userId: number,
    characterId: number
): Promise<ChatSessionRecord | null> => {
    const result = await query<ChatSessionRecord>(
        'SELECT * FROM chat_sessions WHERE user_id = $1 AND character_id = $2',
        [userId, characterId]
    );
    return result.rows.length ? mapSession(result.rows[0]) : null;
};

/** Update session settings (only llm_model currently) */
export const updateSessionSettings = async (
    userId: number,
    characterId: number,
    settings: { llm_model?: string | null }
): Promise<ChatSessionRecord> => {
    const session = await getOrCreateSession(userId, characterId);

    const updates: string[] = [];
    const values: any[] = [userId, characterId];
    let paramIndex = 3;

    if (settings.llm_model !== undefined) {
        updates.push(`llm_model = $${paramIndex++}`);
        values.push(settings.llm_model);
    }

    if (updates.length === 0) {
        return session;
    }

    const result = await query<ChatSessionRecord>(
        `UPDATE chat_sessions 
     SET ${updates.join(', ')} 
     WHERE user_id = $1 AND character_id = $2 
     RETURNING *`,
        values
    );

    return mapSession(result.rows[0]);
};

/** Increment message count and update last_message_at */
export const recordMessage = async (
    userId: number,
    characterId: number
): Promise<void> => {
    // Use upsert to handle case where session doesn't exist
    await query(
        `INSERT INTO chat_sessions (user_id, character_id, messages_count, last_message_at)
     VALUES ($1, $2, 1, NOW())
     ON CONFLICT (user_id, character_id)
     DO UPDATE SET 
       messages_count = chat_sessions.messages_count + 1,
       last_message_at = NOW()`,
        [userId, characterId]
    );
};

/** Get all sessions for a user */
export const getUserSessions = async (
    userId: number
): Promise<ChatSessionRecord[]> => {
    const result = await query<ChatSessionRecord>(
        `SELECT * FROM chat_sessions 
     WHERE user_id = $1 
     ORDER BY last_message_at DESC NULLS LAST`,
        [userId]
    );
    return result.rows.map(mapSession);
};

/** Reset session (delete and recreate) */
export const resetSession = async (
    userId: number,
    characterId: number
): Promise<ChatSessionRecord> => {
    await query(
        'DELETE FROM chat_sessions WHERE user_id = $1 AND character_id = $2',
        [userId, characterId]
    );
    return getOrCreateSession(userId, characterId);
};
