import { query } from '../db/pool.js';

export type RelationshipType = 'neutral' | 'friend' | 'partner' | 'colleague' | 'mentor';
export type MoodType = 'neutral' | 'sweet' | 'sarcastic' | 'formal' | 'playful';

/** Get relationship label from score */
export const getRelationshipLabel = (score: number): string => {
    if (score <= 20) return 'враг';
    if (score <= 40) return 'холоден';
    if (score <= 60) return 'нейтрально';
    if (score <= 80) return 'тёплые';
    return 'близкие';
};

export interface ChatSessionRecord {
    id: number;
    user_id: number;
    character_id: number;
    relationship: RelationshipType;
    relationship_score: number;
    mood: MoodType;
    last_message_at: string | null;
    messages_count: number;
    created_at: string;
}

const mapSession = (row: any): ChatSessionRecord => ({
    id: row.id,
    user_id: row.user_id,
    character_id: row.character_id,
    relationship: row.relationship,
    relationship_score: row.relationship_score ?? 50,
    mood: row.mood,
    last_message_at: row.last_message_at,
    messages_count: row.messages_count,
    created_at: row.created_at,
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

/** Update session relationship type */
export const updateRelationship = async (
    userId: number,
    characterId: number,
    relationship: RelationshipType
): Promise<ChatSessionRecord> => {
    const result = await query<ChatSessionRecord>(
        `UPDATE chat_sessions 
     SET relationship = $3 
     WHERE user_id = $1 AND character_id = $2 
     RETURNING *`,
        [userId, characterId, relationship]
    );

    if (!result.rows.length) {
        // Create if doesn't exist
        const created = await query<ChatSessionRecord>(
            `INSERT INTO chat_sessions (user_id, character_id, relationship)
       VALUES ($1, $2, $3)
       RETURNING *`,
            [userId, characterId, relationship]
        );
        return mapSession(created.rows[0]);
    }

    return mapSession(result.rows[0]);
};

/** Update session mood preference */
export const updateMood = async (
    userId: number,
    characterId: number,
    mood: MoodType
): Promise<ChatSessionRecord> => {
    const result = await query<ChatSessionRecord>(
        `UPDATE chat_sessions 
     SET mood = $3 
     WHERE user_id = $1 AND character_id = $2 
     RETURNING *`,
        [userId, characterId, mood]
    );

    if (!result.rows.length) {
        // Create if doesn't exist
        const created = await query<ChatSessionRecord>(
            `INSERT INTO chat_sessions (user_id, character_id, mood)
       VALUES ($1, $2, $3)
       RETURNING *`,
            [userId, characterId, mood]
        );
        return mapSession(created.rows[0]);
    }

    return mapSession(result.rows[0]);
};

/** Update both relationship and mood */
export const updateSessionSettings = async (
    userId: number,
    characterId: number,
    settings: { relationship?: RelationshipType; mood?: MoodType }
): Promise<ChatSessionRecord> => {
    const session = await getOrCreateSession(userId, characterId);

    const updates: string[] = [];
    const values: any[] = [userId, characterId];
    let paramIndex = 3;

    if (settings.relationship) {
        updates.push(`relationship = $${paramIndex++}`);
        values.push(settings.relationship);
    }
    if (settings.mood) {
        updates.push(`mood = $${paramIndex++}`);
        values.push(settings.mood);
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

/** Reset session (delete and recreate with defaults) */
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

/** Adjust relationship score by delta (positive or negative), clamp to 0-100 */
export const adjustRelationshipScore = async (
    userId: number,
    characterId: number,
    delta: number
): Promise<ChatSessionRecord> => {
    // Ensure session exists
    await getOrCreateSession(userId, characterId);

    const result = await query<ChatSessionRecord>(
        `UPDATE chat_sessions 
         SET relationship_score = GREATEST(0, LEAST(100, COALESCE(relationship_score, 50) + $3))
         WHERE user_id = $1 AND character_id = $2 
         RETURNING *`,
        [userId, characterId, delta]
    );
    return mapSession(result.rows[0]);
};
