import { query } from '../db/pool.js';

export interface CommentRecord {
    id: number;
    character_id: number;
    user_id: number;
    parent_id: number | null;
    content: string;
    created_at: string;
    // Joined fields
    author_nickname: string | null;
    author_username: string | null;
}

export interface CommentWithReplies extends CommentRecord {
    replies: CommentWithReplies[];
}

/**
 * Get all comments for a character with nested replies
 */
export const getCharacterComments = async (characterId: number): Promise<CommentWithReplies[]> => {
    const result = await query<CommentRecord & { author_nickname: string | null; author_username: string | null }>(
        `SELECT c.*, u.nickname as author_nickname, u.username as author_username
         FROM character_comments c
         JOIN users u ON c.user_id = u.id
         WHERE c.character_id = $1
         ORDER BY c.created_at ASC`,
        [characterId]
    );

    // Build tree structure
    const commentsMap = new Map<number, CommentWithReplies>();
    const rootComments: CommentWithReplies[] = [];

    // First pass: create all comment objects
    for (const row of result.rows) {
        commentsMap.set(row.id, { ...row, replies: [] });
    }

    // Second pass: build the tree
    for (const row of result.rows) {
        const comment = commentsMap.get(row.id)!;
        if (row.parent_id === null) {
            rootComments.push(comment);
        } else {
            const parent = commentsMap.get(row.parent_id);
            if (parent) {
                parent.replies.push(comment);
            }
        }
    }

    return rootComments;
};

/**
 * Create a new comment or reply
 * Limits nesting to 1 level: replies to replies become replies to root comment
 */
export const createComment = async (
    userId: number,
    characterId: number,
    content: string,
    parentId?: number | null
): Promise<CommentRecord> => {
    let finalParentId = parentId ?? null;

    // If parentId is provided, check if it's already a reply
    // If so, use its parent_id (root comment) instead
    if (finalParentId) {
        const parentComment = await getCommentById(finalParentId);
        if (parentComment && parentComment.parent_id !== null) {
            // Parent is a reply, so attach to its root
            finalParentId = parentComment.parent_id;
        }
    }

    const result = await query<CommentRecord>(
        `INSERT INTO character_comments (user_id, character_id, content, parent_id)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [userId, characterId, content, finalParentId]
    );
    return result.rows[0];
};

/**
 * Delete a comment (only own comments)
 */
export const deleteComment = async (id: number, userId: number): Promise<boolean> => {
    const result = await query(
        `DELETE FROM character_comments WHERE id = $1 AND user_id = $2`,
        [id, userId]
    );
    return (result.rowCount ?? 0) > 0;
};

/**
 * Get comment by id
 */
export const getCommentById = async (id: number): Promise<CommentRecord | null> => {
    const result = await query<CommentRecord>(
        `SELECT * FROM character_comments WHERE id = $1`,
        [id]
    );
    return result.rows[0] ?? null;
};
