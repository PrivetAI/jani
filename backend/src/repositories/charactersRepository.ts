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
});

export const listCharacters = async (includeInactive = false) => {
  const sql = includeInactive
    ? 'SELECT * FROM characters ORDER BY created_at DESC'
    : 'SELECT * FROM characters WHERE is_active = TRUE ORDER BY created_at DESC';
  const result = await query<CharacterRecord>(sql);
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
      access_type = $5, is_active = $6 WHERE id = $7 RETURNING *`,
    [
      updated.name,
      updated.description_long,
      updated.avatar_url,
      updated.system_prompt,
      updated.access_type,
      updated.is_active,
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
