/**
 * Central export for all modules
 * Re-exports from repositories for cleaner imports
 */

// Characters
export {
    listCharacters,
    getCharacterById,
    createCharacter,
    updateCharacter,
    deleteCharacter,
    type CharacterRecord,
    type CharacterFilters,
} from '../repositories/charactersRepository.js';

// Dialogs
export {
    addDialogMessage,
    getRecentDialogMessages,
    countUserMessagesToday,
    getDialogHistory,
    getLastCharacterForUser,
    type DialogRecord,
} from '../repositories/dialogsRepository.js';

// Memories
export {
    addMemory,
    getMemories,
    getTopMemories,
    deleteMemory,
    deleteAllMemories,
    isMemoryOwner,
    updateMemoryImportance,
    countMemories,
    enforceMemoryLimit,
    type MemoryRecord,
    type MemoryCategory,
} from '../repositories/memoriesRepository.js';

// Payments
export { recordPayment, type PaymentRecord } from '../repositories/paymentsRepository.js';

// Sessions
export {
    getOrCreateSession,
    getSession,
    getSessionById,
    updateSessionSettings,
    recordMessage,
    getUserSessions,
    resetSession,
    type ChatSessionRecord,
} from '../repositories/sessionsRepository.js';

// Stats
export { loadStats, type BasicStats } from '../repositories/statsRepository.js';

// Subscriptions
export {
    getActiveSubscription,
    getSubscriptionStatus,
    createSubscription,
    expireFinishedSubscriptions,
    type SubscriptionRecord,
} from '../repositories/subscriptionsRepository.js';

// Tags
export {
    getAllTags,
    getTagsByCategory,
    getTagById,
    getTagByName,
    createTag,
    deleteTag,
    getCharacterTags,
    addTagToCharacter,
    removeTagFromCharacter,
    setCharacterTags,
    getTagUsageCounts,
    type TagRecord,
} from '../repositories/tagsRepository.js';

// Users
export {
    createUser,
    findUserByTelegramId,
    findUserById,
    findOrCreateUser,
    updateLastCharacter,
    updateUserProfile,
    confirmAdult,
    buildUserProfile,
    type UserRecord,
    type ProfileUpdate,
    type UserProfile,
} from '../repositories/usersRepository.js';

// User-Character Emotional State
export {
    getOrCreateEmotionalState,
    updateEmotionalState,
    buildEmotionalContext,
    getMoodLabel,
    type EmotionalState,
    type EmotionalDelta,
    type CharacterMood,
} from '../repositories/userCharacterStateRepository.js';

