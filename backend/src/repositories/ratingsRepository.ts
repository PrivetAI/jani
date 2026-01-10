import { query } from '../db/pool.js';

export interface RatingRecord {
    user_id: number;
    character_id: number;
    rating: -1 | 1;
    created_at: string;
}

/**
 * Set or update user rating for a character
 * @param rating 1 = like, -1 = dislike, null = remove rating
 */
export const setRating = async (
    userId: number,
    characterId: number,
    rating: 1 | -1 | null
): Promise<void> => {
    if (rating === null) {
        await query(
            'DELETE FROM character_ratings WHERE user_id = $1 AND character_id = $2',
            [userId, characterId]
        );
    } else {
        await query(
            `INSERT INTO character_ratings (user_id, character_id, rating)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id, character_id)
       DO UPDATE SET rating = $3, created_at = NOW()`,
            [userId, characterId, rating]
        );
    }
};

/**
 * Get user's rating for a character
 */
export const getUserRating = async (
    userId: number,
    characterId: number
): Promise<1 | -1 | null> => {
    const result = await query<{ rating: number }>(
        'SELECT rating FROM character_ratings WHERE user_id = $1 AND character_id = $2',
        [userId, characterId]
    );
    return result.rows.length ? (result.rows[0].rating as 1 | -1) : null;
};

/**
 * Get rating counts for a character
 */
export const getCharacterRatings = async (
    characterId: number
): Promise<{ likes: number; dislikes: number }> => {
    const result = await query<{ likes: string; dislikes: string }>(
        `SELECT 
      COALESCE(SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END), 0) as likes,
      COALESCE(SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END), 0) as dislikes
     FROM character_ratings WHERE character_id = $1`,
        [characterId]
    );
    return {
        likes: parseInt(result.rows[0]?.likes || '0'),
        dislikes: parseInt(result.rows[0]?.dislikes || '0'),
    };
};

/**
 * Get likes count for multiple characters (for list display)
 */
export const getCharactersLikesCount = async (
    characterIds: number[]
): Promise<Map<number, number>> => {
    if (!characterIds.length) return new Map();

    const result = await query<{ character_id: number; likes: string }>(
        `SELECT character_id, COUNT(*) as likes
     FROM character_ratings
     WHERE character_id = ANY($1) AND rating = 1
     GROUP BY character_id`,
        [characterIds]
    );

    const map = new Map<number, number>();
    for (const row of result.rows) {
        map.set(row.character_id, parseInt(row.likes));
    }
    return map;
};
