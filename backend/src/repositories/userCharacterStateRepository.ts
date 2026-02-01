import { query } from '../db/pool.js';

// Emotional state dimensions
export interface EmotionalState {
    userId: number;
    characterId: number;
    attraction: number;  // -100 to +100
    trust: number;       // -100 to +100
    affection: number;   // -100 to +100
    dominance: number;   // -100 to +100 (negative = user dominates)
    updatedAt: string;
    // Computed field
    closeness: number;   // 0 to 100, computed from (attraction + trust + affection) / 3
}

export interface EmotionalDelta {
    attraction?: number;
    trust?: number;
    affection?: number;
    dominance?: number;
}

interface StateRecord {
    user_id: number;
    character_id: number;
    attraction: number;
    trust: number;
    affection: number;
    dominance: number;
    updated_at: string;
}

const DEFAULT_STATE = {
    attraction: 0,
    trust: 10,
    affection: 5,
    dominance: 0,
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const computeCloseness = (attraction: number, trust: number, affection: number): number => {
    return Math.max(0, Math.round((attraction + trust + affection) / 3));
};

const mapState = (row: StateRecord): EmotionalState => ({
    userId: row.user_id,
    characterId: row.character_id,
    attraction: row.attraction,
    trust: row.trust,
    affection: row.affection,
    dominance: row.dominance,
    updatedAt: row.updated_at,
    closeness: computeCloseness(row.attraction, row.trust, row.affection),
});

/**
 * Get or create emotional state for a user-character pair
 */
export const getOrCreateEmotionalState = async (
    userId: number,
    characterId: number
): Promise<EmotionalState> => {
    // Try to get existing
    const existing = await query<StateRecord>(
        'SELECT * FROM user_character_state WHERE user_id = $1 AND character_id = $2',
        [userId, characterId]
    );

    if (existing.rows.length > 0) {
        return mapState(existing.rows[0]);
    }

    // Get character's initial values
    const charResult = await query<{
        initial_attraction: number;
        initial_trust: number;
        initial_affection: number;
        initial_dominance: number;
    }>(
        'SELECT initial_attraction, initial_trust, initial_affection, initial_dominance FROM characters WHERE id = $1',
        [characterId]
    );

    const charDefaults = charResult.rows[0];
    const initialAttraction = charDefaults?.initial_attraction ?? DEFAULT_STATE.attraction;
    const initialTrust = charDefaults?.initial_trust ?? DEFAULT_STATE.trust;
    const initialAffection = charDefaults?.initial_affection ?? DEFAULT_STATE.affection;
    const initialDominance = charDefaults?.initial_dominance ?? DEFAULT_STATE.dominance;

    // Create new with character's initial values
    const result = await query<StateRecord>(
        `INSERT INTO user_character_state (user_id, character_id, attraction, trust, affection, dominance)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
        [
            userId,
            characterId,
            initialAttraction,
            initialTrust,
            initialAffection,
            initialDominance,
        ]
    );

    return mapState(result.rows[0]);
};

/**
 * Update emotional state with deltas
 * Clamps all values to -100..+100 range
 */
export const updateEmotionalState = async (
    userId: number,
    characterId: number,
    delta: EmotionalDelta
): Promise<EmotionalState> => {
    const current = await getOrCreateEmotionalState(userId, characterId);

    const newAttraction = clamp(current.attraction + (delta.attraction || 0), -100, 100);
    const newTrust = clamp(current.trust + (delta.trust || 0), -100, 100);
    const newAffection = clamp(current.affection + (delta.affection || 0), -100, 100);
    const newDominance = clamp(current.dominance + (delta.dominance || 0), -100, 100);

    const result = await query<StateRecord>(
        `UPDATE user_character_state 
     SET attraction = $1, trust = $2, affection = $3, dominance = $4, updated_at = NOW()
     WHERE user_id = $5 AND character_id = $6
     RETURNING *`,
        [
            newAttraction,
            newTrust,
            newAffection,
            newDominance,
            userId,
            characterId,
        ]
    );

    return mapState(result.rows[0]);
};



/**
 * Get emotional context string for LLM prompt
 */
export const buildEmotionalContext = (state: EmotionalState, gender: 'male' | 'female' = 'female'): string => {
    const parts: string[] = [];

    // Closeness level
    let closenessLabel: string;
    if (state.closeness >= 80) closenessLabel = 'очень близкие';
    else if (state.closeness >= 50) closenessLabel = 'тёплые';
    else if (state.closeness >= 20) closenessLabel = 'нейтральные';
    else if (state.closeness >= 0) closenessLabel = 'прохладные';
    else closenessLabel = 'напряжённые';

    parts.push(`Отношения: ${closenessLabel} (близость ${state.closeness}/100)`);

    // Attraction
    let attractionLabel: string | null = null;
    if (state.attraction >= 80) attractionLabel = 'страстное влечение';
    else if (state.attraction >= 50) attractionLabel = 'сильное влечение';
    else if (state.attraction >= 20) attractionLabel = 'лёгкий интерес';
    else if (state.attraction <= -60) attractionLabel = 'сильное отталкивание';
    else if (state.attraction <= -30) attractionLabel = 'неприязнь';

    // Trust
    let trustLabel: string | null = null;
    if (state.trust >= 80) trustLabel = 'абсолютное доверие';
    else if (state.trust >= 50) trustLabel = 'высокое доверие';
    else if (state.trust >= 20) trustLabel = 'осторожное доверие';
    else if (state.trust <= -60) trustLabel = 'глубокое недоверие';
    else if (state.trust <= -30) trustLabel = 'подозрительность';

    // Affection
    let affectionLabel: string | null = null;
    if (state.affection >= 80) affectionLabel = 'глубокая любовь';
    else if (state.affection >= 50) affectionLabel = 'сильная привязанность';
    else if (state.affection >= 20) affectionLabel = 'симпатия';
    else if (state.affection <= -60) affectionLabel = 'враждебность';
    else if (state.affection <= -30) affectionLabel = 'холодность';

    // Dominance
    let dominanceLabel: string | null = null;
    if (state.dominance >= 60) dominanceLabel = 'персонаж полностью доминирует';
    else if (state.dominance >= 30) dominanceLabel = 'персонаж ведёт';
    else if (state.dominance <= -60) dominanceLabel = 'пользователь полностью доминирует';
    else if (state.dominance <= -30) dominanceLabel = 'пользователь ведёт';

    const dims = [attractionLabel, trustLabel, affectionLabel].filter(Boolean);
    if (dims.length) parts.push(dims.join(', '));
    if (dominanceLabel) parts.push(dominanceLabel);

    return parts.join('. ') + '.';
};

/** Delete emotional state for a user-character pair */
export const deleteEmotionalState = async (
    userId: number,
    characterId: number
): Promise<boolean> => {
    const result = await query(
        'DELETE FROM user_character_state WHERE user_id = $1 AND character_id = $2',
        [userId, characterId]
    );
    return (result.rowCount ?? 0) > 0;
};
