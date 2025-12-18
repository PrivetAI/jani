import { query } from '../db/pool.js';

export interface CharacterRecord {
  id: number;
  name: string;
  description_long: string;
  avatar_url: string | null;
  system_prompt: string;
  access_type: 'free' | 'premium';
  is_active: boolean;
  created_at: string;
  // LLM parameter overrides (null = use global defaults)
  llm_model: string | null;
  llm_temperature: number | null;
  llm_top_p: number | null;
  llm_repetition_penalty: number | null;
  llm_max_tokens: number | null;
  // Scene prompt (null = use default)
  scene_prompt: string | null;
}

const mapCharacter = (row: any): CharacterRecord => ({
  id: row.id,
  name: row.name,
  description_long: row.description_long,
  avatar_url: row.avatar_url,
  system_prompt: row.system_prompt,
  access_type: row.access_type,
  is_active: row.is_active,
  created_at: row.created_at,
  llm_model: row.llm_model ?? null,
  llm_temperature: row.llm_temperature ? parseFloat(row.llm_temperature) : null,
  llm_top_p: row.llm_top_p ? parseFloat(row.llm_top_p) : null,
  llm_repetition_penalty: row.llm_repetition_penalty ? parseFloat(row.llm_repetition_penalty) : null,
  llm_max_tokens: row.llm_max_tokens ?? null,
  scene_prompt: row.scene_prompt ?? null,
});

export interface CharacterFilters {
  includeInactive?: boolean;
  search?: string;
  accessType?: 'free' | 'premium';
  tagIds?: number[];
}

export const listCharacters = async (filters: CharacterFilters = {}) => {
  let sql = 'SELECT DISTINCT c.* FROM characters c';
  const params: any[] = [];
  const conditions: string[] = [];

  // Joins if needed
  if (filters.tagIds?.length) {
    sql += ' JOIN character_tags ct ON c.id = ct.character_id';
    conditions.push(`ct.tag_id = ANY($${params.length + 1})`);
    params.push(filters.tagIds);
  }

  // Conditions
  if (!filters.includeInactive) {
    conditions.push('c.is_active = TRUE');
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
  return result.rows.map(mapCharacter);
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
  scene_prompt?: string | null;
}

export const createCharacter = async (payload: CharacterPayload) => {
  const result = await query<CharacterRecord>(
    `INSERT INTO characters (name, description_long, avatar_url, system_prompt, access_type, is_active)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      payload.name,
      payload.description_long,
      payload.avatar_url ?? null,
      payload.system_prompt,
      payload.access_type,
      payload.is_active ?? true,
    ]
  );
  return mapCharacter(result.rows[0]);
};

export const updateCharacter = async (id: number, payload: Partial<CharacterPayload>) => {
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
      access_type = $5, is_active = $6, scene_prompt = $7 WHERE id = $8 RETURNING *`,
    [
      updated.name,
      updated.description_long,
      updated.avatar_url,
      updated.system_prompt,
      updated.access_type,
      updated.is_active,
      payload.scene_prompt !== undefined ? payload.scene_prompt : existing.scene_prompt,
      id,
    ]
  );

  return mapCharacter(result.rows[0]);
};

export const deleteCharacter = async (id: number) => {
  await query('UPDATE users SET last_character_id = NULL WHERE last_character_id = $1', [id]);
  const result = await query('DELETE FROM characters WHERE id = $1 RETURNING id', [id]);
  if (!result.rowCount) {
    throw new Error('Character not found');
  }
};
