import { query } from '../db/pool.js';

// Emotional state dimensions
export interface EmotionalState {
    userId: number;
    characterId: number;
    attraction: number;  // -50 to +50
    trust: number;       // -50 to +50
    affection: number;   // -50 to +50
    dominance: number;   // -50 to +50 (negative = user dominates)
    mood: CharacterMood;
    updatedAt: string;
    // Computed field
    closeness: number;   // 0 to 50, computed from (attraction + trust + affection) / 3
}

export interface CharacterMood {
    primary: string;      // e.g. "jealous", "aroused", "vulnerable"
    secondary?: string;
    intensity: number;    // 1-10
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
    mood: CharacterMood;
    updated_at: string;
}

const DEFAULT_STATE = {
    attraction: 0,
    trust: 10,
    affection: 5,
    dominance: 0,
    mood: { primary: 'neutral', intensity: 5 } as CharacterMood,
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
    mood: row.mood,
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
        `INSERT INTO user_character_state (user_id, character_id, attraction, trust, affection, dominance, mood)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
        [
            userId,
            characterId,
            initialAttraction,
            initialTrust,
            initialAffection,
            initialDominance,
            JSON.stringify(DEFAULT_STATE.mood),
        ]
    );

    return mapState(result.rows[0]);
};

/**
 * Update emotional state with deltas
 * Clamps all values to -50..+50 range
 */
export const updateEmotionalState = async (
    userId: number,
    characterId: number,
    delta: EmotionalDelta,
    newMood?: CharacterMood
): Promise<EmotionalState> => {
    const current = await getOrCreateEmotionalState(userId, characterId);

    const newAttraction = clamp(current.attraction + (delta.attraction || 0), -50, 50);
    const newTrust = clamp(current.trust + (delta.trust || 0), -50, 50);
    const newAffection = clamp(current.affection + (delta.affection || 0), -50, 50);
    const newDominance = clamp(current.dominance + (delta.dominance || 0), -50, 50);

    const result = await query<StateRecord>(
        `UPDATE user_character_state 
     SET attraction = $1, trust = $2, affection = $3, dominance = $4, mood = $5, updated_at = NOW()
     WHERE user_id = $6 AND character_id = $7
     RETURNING *`,
        [
            newAttraction,
            newTrust,
            newAffection,
            newDominance,
            JSON.stringify(newMood || current.mood),
            userId,
            characterId,
        ]
    );

    return mapState(result.rows[0]);
};

/**
 * Get mood label in Russian with correct grammatical gender
 */
export const getMoodLabel = (mood: CharacterMood, gender: 'male' | 'female' = 'female'): string => {
    const moodLabels: Record<string, { male: string; female: string }> = {
        neutral: { male: 'спокойный', female: 'спокойная' },
        joyful: { male: 'радостный', female: 'радостная' },
        sad: { male: 'грустный', female: 'грустная' },
        angry: { male: 'злой', female: 'злая' },
        aroused: { male: 'возбуждённый', female: 'возбуждённая' },
        jealous: { male: 'ревнивый', female: 'ревнивая' },
        vulnerable: { male: 'уязвимый', female: 'уязвимая' },
        playful: { male: 'игривый', female: 'игривая' },
        melancholic: { male: 'меланхоличный', female: 'меланхоличная' },
        tender: { male: 'нежный', female: 'нежная' },
        passionate: { male: 'страстный', female: 'страстная' },
        shy: { male: 'смущённый', female: 'смущённая' },
        curious: { male: 'любопытный', female: 'любопытная' },
        flirty: { male: 'флиртующий', female: 'флиртующая' },
    };

    const moodData = moodLabels[mood.primary];
    const label = moodData ? moodData[gender] : mood.primary;
    if (mood.intensity >= 8) return `очень ${label}`;
    if (mood.intensity <= 3) return `слегка ${label}`;
    return label;
};

/**
 * Get emotional context string for LLM prompt
 */
export const buildEmotionalContext = (state: EmotionalState, gender: 'male' | 'female' = 'female'): string => {
    const parts: string[] = [];

    // Closeness level
    let closenessLabel: string;
    if (state.closeness >= 40) closenessLabel = 'очень близкие';
    else if (state.closeness >= 25) closenessLabel = 'тёплые';
    else if (state.closeness >= 10) closenessLabel = 'нейтральные';
    else if (state.closeness >= 0) closenessLabel = 'прохладные';
    else closenessLabel = 'напряжённые';

    parts.push(`Отношения: ${closenessLabel} (близость ${state.closeness}/50)`);

    // Individual dimensions
    const dims: string[] = [];
    if (state.attraction > 20) dims.push('сильное влечение');
    else if (state.attraction < -20) dims.push('отталкивание');

    if (state.trust > 30) dims.push('полное доверие');
    else if (state.trust < -20) dims.push('недоверие');

    if (state.affection > 30) dims.push('глубокая привязанность');
    else if (state.affection < -20) dims.push('холодность');

    if (state.dominance > 20) parts.push('Персонаж доминирует в отношениях');
    else if (state.dominance < -20) parts.push('Пользователь ведёт в отношениях');

    if (dims.length) parts.push(dims.join(', '));

    // Mood
    const moodLabel = getMoodLabel(state.mood, gender);
    parts.push(`Текущее настроение персонажа: ${moodLabel}`);

    return parts.join('. ') + '.';
};
