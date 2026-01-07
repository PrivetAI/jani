/**
 * Response mappers for consistent API responses
 */

import type { CharacterRecord } from '../modules/index.js';
import type { MemoryRecord } from '../repositories/memoriesRepository.js';
import type { DialogRecord } from '../repositories/dialogsRepository.js';

/**
 * Map character record to public API response
 */
export const mapCharacterResponse = (character: CharacterRecord) => ({
    id: character.id,
    name: character.name,
    description: character.description_long,
    avatarUrl: character.avatar_url,
    accessType: character.access_type,
    isActive: character.is_active,
    grammaticalGender: character.grammatical_gender,
});

/**
 * Map memory record to API response
 */
export const mapMemoryResponse = (memory: MemoryRecord) => ({
    id: memory.id,
    content: memory.content,
    importance: memory.importance,
    createdAt: memory.created_at,
});

/**
 * Map dialog record to API response
 */
export const mapDialogResponse = (dialog: DialogRecord) => ({
    id: dialog.id,
    role: dialog.role,
    text: dialog.message_text,
    createdAt: dialog.created_at,
});
