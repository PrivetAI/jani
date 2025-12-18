import { query } from '../db/pool.js';

export type MemoryCategory = 'fact' | 'preference' | 'emotion' | 'relationship';

export interface MemoryRecord {
    id: number;
    user_id: number;
    character_id: number;
    memory_category: MemoryCategory;
    content: string;
    importance: number;
    created_at: string;
    updated_at: string;
}

const mapMemory = (row: any): MemoryRecord => ({
    id: row.id,
    user_id: row.user_id,
    character_id: row.character_id,
    memory_category: row.memory_category,
    content: row.content,
    importance: row.importance,
    created_at: row.created_at,
    updated_at: row.updated_at,
});

/** Get all memories for a user-character pair, ordered by importance */
export const getMemories = async (
    userId: number,
    characterId: number
): Promise<MemoryRecord[]> => {
    const result = await query<MemoryRecord>(
        `SELECT * FROM character_memories 
     WHERE user_id = $1 AND character_id = $2 
     ORDER BY importance DESC, created_at DESC`,
        [userId, characterId]
    );
    return result.rows.map(mapMemory);
};

/** Get top N most important memories */
export const getTopMemories = async (
    userId: number,
    characterId: number,
    limit = 10
): Promise<MemoryRecord[]> => {
    const result = await query<MemoryRecord>(
        `SELECT * FROM character_memories 
     WHERE user_id = $1 AND character_id = $2 
     ORDER BY importance DESC 
     LIMIT $3`,
        [userId, characterId, limit]
    );
    return result.rows.map(mapMemory);
};

/** Add a new memory */
export const addMemory = async (
    userId: number,
    characterId: number,
    content: string,
    category: MemoryCategory = 'fact',
    importance = 5
): Promise<MemoryRecord> => {
    const result = await query<MemoryRecord>(
        `INSERT INTO character_memories (user_id, character_id, memory_category, content, importance)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
        [userId, characterId, category, content, importance]
    );
    return mapMemory(result.rows[0]);
};

/** Update memory importance */
export const updateMemoryImportance = async (
    memoryId: number,
    importance: number
): Promise<void> => {
    await query(
        `UPDATE character_memories SET importance = $1, updated_at = NOW() WHERE id = $2`,
        [importance, memoryId]
    );
};

/** Delete a specific memory */
export const deleteMemory = async (memoryId: number): Promise<boolean> => {
    const result = await query(
        'DELETE FROM character_memories WHERE id = $1 RETURNING id',
        [memoryId]
    );
    return (result.rowCount ?? 0) > 0;
};

/** Delete all memories for a user-character pair */
export const deleteAllMemories = async (
    userId: number,
    characterId: number
): Promise<number> => {
    const result = await query(
        'DELETE FROM character_memories WHERE user_id = $1 AND character_id = $2',
        [userId, characterId]
    );
    return result.rowCount ?? 0;
};

/** Count memories for a user-character pair */
export const countMemories = async (
    userId: number,
    characterId: number
): Promise<number> => {
    const result = await query<{ count: string }>(
        'SELECT COUNT(*) FROM character_memories WHERE user_id = $1 AND character_id = $2',
        [userId, characterId]
    );
    return Number(result.rows[0]?.count ?? 0);
};

/** Check if user owns a memory (for authorization) */
export const isMemoryOwner = async (
    memoryId: number,
    userId: number
): Promise<boolean> => {
    const result = await query<{ user_id: number }>(
        'SELECT user_id FROM character_memories WHERE id = $1',
        [memoryId]
    );
    return result.rows[0]?.user_id === userId;
};

/** 
 * Enforce memory limit by deleting oldest/lowest-importance memories
 * Returns count of deleted memories
 */
export const enforceMemoryLimit = async (
    userId: number,
    characterId: number,
    maxMemories: number = 50
): Promise<number> => {
    const count = await countMemories(userId, characterId);
    if (count <= maxMemories) return 0;

    const toDelete = count - maxMemories;

    // Delete lowest importance first, then oldest
    const result = await query(
        `DELETE FROM character_memories 
         WHERE id IN (
           SELECT id FROM character_memories 
           WHERE user_id = $1 AND character_id = $2 
           ORDER BY importance ASC, created_at ASC 
           LIMIT $3
         )`,
        [userId, characterId, toDelete]
    );

    return result.rowCount ?? 0;
};
