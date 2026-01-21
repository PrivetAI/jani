import { query } from '../db/pool.js';

export interface CharacterRecord {
  id: number;
  name: string;
  description_long: string;
  avatar_url: string | null;
  system_prompt: string;
  access_type: 'free' | 'premium';
  is_active: boolean;
  is_approved: boolean;
  created_at: string;
  created_by: number | null;
  // Catalog fields
  genre: string | null;
  grammatical_gender: 'male' | 'female';
  // Initial relationship values
  initial_attraction: number;
  initial_trust: number;
  initial_affection: number;
  initial_dominance: number;
  // LLM parameter overrides (null = use global defaults)
  llm_provider: string | null;
  llm_model: string | null;
  llm_temperature: number | null;
  llm_top_p: number | null;
  llm_repetition_penalty: number | null;
}

const mapCharacter = (row: any): CharacterRecord => ({
  id: row.id,
  name: row.name,
  description_long: row.description_long,
  avatar_url: row.avatar_url,
  system_prompt: row.system_prompt,
  access_type: row.access_type,
  is_active: row.is_active,
  is_approved: row.is_approved ?? true,
  created_at: row.created_at,
  created_by: row.created_by ?? null,
  genre: row.genre ?? null,
  grammatical_gender: row.grammatical_gender ?? 'female',
  initial_attraction: row.initial_attraction ?? 0,
  initial_trust: row.initial_trust ?? 10,
  initial_affection: row.initial_affection ?? 5,
  initial_dominance: row.initial_dominance ?? 0,
  llm_provider: row.llm_provider ?? null,
  llm_model: row.llm_model ?? null,
  llm_temperature: row.llm_temperature ? parseFloat(row.llm_temperature) : null,
  llm_top_p: row.llm_top_p ? parseFloat(row.llm_top_p) : null,
  llm_repetition_penalty: row.llm_repetition_penalty ? parseFloat(row.llm_repetition_penalty) : null,
});

export interface CharacterFilters {
  includeInactive?: boolean;
  includeUnapproved?: boolean;
  search?: string;
  accessType?: 'free' | 'premium';
  tagIds?: number[];
}

// Cache for characters list (10 minutes)
const CACHE_TTL_MS = 10 * 60 * 1000;
let charactersCache: { data: CharacterRecord[]; cachedAt: number } | null = null;

/** Invalidate characters cache (call on create/update/delete) */
export const invalidateCharactersCache = () => {
  charactersCache = null;
};

export const listCharacters = async (filters: CharacterFilters = {}) => {
  // Use cache only for default catalog view (no filters except default)
  const isDefaultView = !filters.search && !filters.tagIds?.length && !filters.accessType && !filters.includeInactive && !filters.includeUnapproved;

  if (isDefaultView && charactersCache && Date.now() - charactersCache.cachedAt < CACHE_TTL_MS) {
    return charactersCache.data;
  }

  let sql = 'SELECT DISTINCT c.* FROM characters c';
  const params: any[] = [];
  const conditions: string[] = [];

  // AND logic: show only characters that have ALL selected tags
  if (filters.tagIds?.length) {
    conditions.push(`c.id IN (
      SELECT character_id FROM character_tags 
      WHERE tag_id = ANY($${params.length + 1})
      GROUP BY character_id 
      HAVING COUNT(DISTINCT tag_id) = $${params.length + 2}
    )`);
    params.push(filters.tagIds);
    params.push(filters.tagIds.length);
  }

  // Conditions
  if (!filters.includeInactive) {
    conditions.push('c.is_active = TRUE');
  }

  // By default, only show approved characters
  if (!filters.includeUnapproved) {
    conditions.push('c.is_approved = TRUE');
  }

  if (filters.accessType) {
    conditions.push(`c.access_type = $${params.length + 1}`);
    params.push(filters.accessType);
  }

  if (filters.search) {
    conditions.push(`(c.name ILIKE $${params.length + 1} OR c.description_long ILIKE $${params.length + 1})`);
    const searchPattern = `%${filters.search}%`;
    params.push(searchPattern);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY c.created_at DESC';

  const result = await query<CharacterRecord>(sql, params);
  const characters = result.rows.map(mapCharacter);

  // Cache only default view results
  if (isDefaultView) {
    charactersCache = { data: characters, cachedAt: Date.now() };
  }

  return characters;
};

export const getCharacterById = async (id: number): Promise<CharacterRecord | null> => {
  const result = await query<CharacterRecord>('SELECT * FROM characters WHERE id = $1 LIMIT 1', [id]);
  return result.rows.length ? mapCharacter(result.rows[0]) : null;
};

interface CharacterPayload {
  name: string;
  description_long: string;
  avatar_url?: string | null;
  system_prompt: string;
  access_type: 'free' | 'premium';
  is_active?: boolean;
  created_by?: number | null;
  llm_provider?: string | null;
  llm_model?: string | null;
}

export const createCharacter = async (payload: CharacterPayload) => {
  const result = await query<CharacterRecord>(
    `INSERT INTO characters (name, description_long, avatar_url, system_prompt, access_type, is_active, created_by, llm_provider, llm_model)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
    [
      payload.name,
      payload.description_long,
      payload.avatar_url ?? null,
      payload.system_prompt,
      payload.access_type,
      payload.is_active ?? true,
      payload.created_by ?? null,
      payload.llm_provider ?? null,
      payload.llm_model ?? null
    ]
  );
  invalidateCharactersCache();
  return mapCharacter(result.rows[0]);
};

export const updateCharacter = async (id: number, payload: Partial<CharacterRecord>) => {
  const existing = await getCharacterById(id);
  if (!existing) {
    throw new Error('Character not found');
  }

  const updated = {
    ...existing,
    ...payload,
  };

  const result = await query<CharacterRecord>(
    `UPDATE characters SET name = $1, description_long = $2, avatar_url = $3, system_prompt = $4,
      access_type = $5, is_active = $6, genre = $7, grammatical_gender = $8,
      initial_attraction = $9, initial_trust = $10, initial_affection = $11, initial_dominance = $12,
      llm_provider = $13, llm_model = $14,
      llm_temperature = $15, llm_top_p = $16, llm_repetition_penalty = $17
      WHERE id = $18 RETURNING *`,
    [
      updated.name,
      updated.description_long,
      updated.avatar_url,
      updated.system_prompt,
      updated.access_type,
      updated.is_active,
      updated.genre,
      updated.grammatical_gender,
      updated.initial_attraction,
      updated.initial_trust,
      updated.initial_affection,
      updated.initial_dominance,
      updated.llm_provider,
      updated.llm_model,
      updated.llm_temperature,
      updated.llm_top_p,
      updated.llm_repetition_penalty,
      id,
    ]
  );

  invalidateCharactersCache();
  return mapCharacter(result.rows[0]);
};

export const deleteCharacter = async (id: number) => {
  // Clear references in users table
  await query('UPDATE users SET last_character_id = NULL WHERE last_character_id = $1', [id]);

  // Delete related records (cascade) - order matters due to foreign keys
  // Delete dialogs (messages are in dialogs table, not separate)
  await query('DELETE FROM dialogs WHERE character_id = $1', [id]);
  // Delete dialog summaries
  await query('DELETE FROM dialog_summaries WHERE character_id = $1', [id]);
  // Delete character ratings (likes/dislikes)
  await query('DELETE FROM character_ratings WHERE character_id = $1', [id]);
  // Delete character comments
  await query('DELETE FROM character_comments WHERE character_id = $1', [id]);
  // Delete character memories
  await query('DELETE FROM character_memories WHERE character_id = $1', [id]);
  // Delete character tags
  await query('DELETE FROM character_tags WHERE character_id = $1', [id]);
  // Delete chat sessions
  await query('DELETE FROM chat_sessions WHERE character_id = $1', [id]);
  // Delete user character states
  await query('DELETE FROM user_character_state WHERE character_id = $1', [id]);

  // Finally delete the character
  const result = await query('DELETE FROM characters WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) {
    throw new Error('Character not found');
  }
  invalidateCharactersCache();
};
