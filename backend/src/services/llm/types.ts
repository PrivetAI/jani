
export interface LLMMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export interface LLMRequestOptions {
    model?: string;
    temperature?: number;
    topP?: number;
    repetitionPenalty?: number;
    maxTokens?: number;
    stop?: string[];
    provider?: 'openrouter' | 'gemini';
}

export interface LLMProvider {
    generateReply(messages: LLMMessage[], options: LLMRequestOptions): Promise<string>;
}
