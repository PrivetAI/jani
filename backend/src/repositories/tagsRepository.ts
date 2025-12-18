import { query } from '../db/pool.js';

export interface TagRecord {
    id: number;
    name: string;
    category: string;
    created_at: string;
}

const mapTag = (row: any): TagRecord => ({
    id: row.id,
    name: row.name,
    category: row.category,
    created_at: row.created_at,
});

/** Get all tags */
export const getAllTags = async (): Promise<TagRecord[]> => {
    const result = await query<TagRecord>('SELECT * FROM tags ORDER BY category, name');
    return result.rows.map(mapTag);
};

/** Get tags by category */
export const getTagsByCategory = async (category: string): Promise<TagRecord[]> => {
    const result = await query<TagRecord>(
        'SELECT * FROM tags WHERE category = $1 ORDER BY name',
        [category]
    );
    return result.rows.map(mapTag);
};

/** Get tag by ID */
export const getTagById = async (id: number): Promise<TagRecord | null> => {
    const result = await query<TagRecord>('SELECT * FROM tags WHERE id = $1', [id]);
    return result.rows.length ? mapTag(result.rows[0]) : null;
};

/** Get tag by name */
export const getTagByName = async (name: string): Promise<TagRecord | null> => {
    const result = await query<TagRecord>(
        'SELECT * FROM tags WHERE name = $1',
        [name.toLowerCase()]
    );
    return result.rows.length ? mapTag(result.rows[0]) : null;
};

/** Create a new tag */
export const createTag = async (
    name: string,
    category: string
): Promise<TagRecord> => {
    const result = await query<TagRecord>(
        'INSERT INTO tags (name, category) VALUES ($1, $2) RETURNING *',
        [name.toLowerCase(), category]
    );
    return mapTag(result.rows[0]);
};

/** Delete a tag */
export const deleteTag = async (id: number): Promise<boolean> => {
    const result = await query('DELETE FROM tags WHERE id = $1 RETURNING id', [id]);
    return (result.rowCount ?? 0) > 0;
};

/** Get tags for a character */
export const getCharacterTags = async (characterId: number): Promise<TagRecord[]> => {
    const result = await query<TagRecord>(
        `SELECT t.* FROM tags t
     INNER JOIN character_tags ct ON t.id = ct.tag_id
     WHERE ct.character_id = $1
     ORDER BY t.category, t.name`,
        [characterId]
    );
    return result.rows.map(mapTag);
};

/** Add tag to character */
export const addTagToCharacter = async (
    characterId: number,
    tagId: number
): Promise<void> => {
    await query(
        `INSERT INTO character_tags (character_id, tag_id) 
     VALUES ($1, $2) 
     ON CONFLICT (character_id, tag_id) DO NOTHING`,
        [characterId, tagId]
    );
};

/** Remove tag from character */
export const removeTagFromCharacter = async (
    characterId: number,
    tagId: number
): Promise<void> => {
    await query(
        'DELETE FROM character_tags WHERE character_id = $1 AND tag_id = $2',
        [characterId, tagId]
    );
};

/** Set tags for character (replace all) */
export const setCharacterTags = async (
    characterId: number,
    tagIds: number[]
): Promise<void> => {
    // Remove all existing tags
    await query('DELETE FROM character_tags WHERE character_id = $1', [characterId]);

    // Add new tags
    if (tagIds.length > 0) {
        const values = tagIds.map((_, i) => `($1, $${i + 2})`).join(', ');
        await query(
            `INSERT INTO character_tags (character_id, tag_id) VALUES ${values}`,
            [characterId, ...tagIds]
        );
    }
};

/** Get tag usage counts (for admin stats) */
export const getTagUsageCounts = async (): Promise<{ tag: TagRecord; count: number }[]> => {
    const result = await query<TagRecord & { usage_count: string }>(
        `SELECT t.*, COUNT(ct.character_id) as usage_count
     FROM tags t
     LEFT JOIN character_tags ct ON t.id = ct.tag_id
     GROUP BY t.id
     ORDER BY usage_count DESC, t.name`,
        []
    );
    return result.rows.map(row => ({
        tag: mapTag(row),
        count: Number(row.usage_count),
    }));
};
