import type { CharacterRecord, DialogRecord } from '../../modules/index.js';
import type { EmotionalDelta } from '../../modules/index.js';

export interface ChatRequest {
    userId: number;
    username?: string;
    userDisplayName?: string;
    userGender?: string;
    character: CharacterRecord;
    userMessage: string;
    history: DialogRecord[];
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
