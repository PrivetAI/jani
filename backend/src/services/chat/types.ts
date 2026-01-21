import type { CharacterRecord, DialogRecord } from '../../modules/index.js';
import type { EmotionalDelta } from '../../modules/index.js';

export interface ChatRequest {
    userId: number;
    username?: string;
    userDisplayName?: string;
    userGender?: string;
    voicePerson?: 1 | 3;
    character: CharacterRecord;
    userMessage: string;
    history: DialogRecord[];
    // User-level LLM settings (from chat_sessions table + allowed_models lookup)
    sessionLlmSettings?: {
        model?: string | null;
        temperature?: number | null;
        topP?: number | null;
        provider?: string | null;
    };
}

export interface LLMResponseJSON {
    reply: string;
    thoughts?: string;
    relationship_delta?: EmotionalDelta | number;
    mood?: string;
}

export interface ExtractedData {
    cleanedReply: string;
    thoughts?: string;
    emotionalDelta: EmotionalDelta;
    mood?: string;
}
