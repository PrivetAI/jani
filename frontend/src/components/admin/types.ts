export interface Character {
    id: number;
    name: string;
    description: string;
    systemPrompt: string;
    accessType: 'free' | 'premium';
    isActive: boolean;
    avatarUrl?: string;
    genre?: string | null;
    contentRating?: 'sfw' | 'nsfw' | null;
    grammaticalGender?: 'male' | 'female';
    initialAttraction?: number;
    initialTrust?: number;
    initialAffection?: number;
    initialDominance?: number;
    llmProvider?: 'openrouter' | 'gemini' | 'openai' | null;
    llmModel?: string | null;
    llmTemperature?: number | null;
    llmTopP?: number | null;
    llmRepetitionPenalty?: number | null;
    tagIds?: number[];
}

export interface LLMModel {
    id: string;
    name: string;
}
