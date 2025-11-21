import { config } from '../config.js';
import { logger } from '../logger.js';

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequestOptions {
  temperature?: number;
  topP?: number;
  repetitionPenalty?: number;
  maxTokens?: number;
  stop?: string[];
}

const DEFAULT_OPTIONS: Required<Pick<LLMRequestOptions, 'temperature' | 'topP' | 'repetitionPenalty'>> = {
  temperature: config.llmDefaultTemperature,
  topP: config.llmDefaultTopP,
  repetitionPenalty: config.llmDefaultRepetitionPenalty,
};

export class LLMService {
  async generateReply(messages: LLMMessage[], options: LLMRequestOptions = {}): Promise<string> {
    const startedAt = Date.now();
    const payload = {
      model: config.openRouterModel,
      messages,
      temperature: options.temperature ?? DEFAULT_OPTIONS.temperature,
      top_p: options.topP ?? DEFAULT_OPTIONS.topP,
      repetition_penalty: options.repetitionPenalty ?? DEFAULT_OPTIONS.repetitionPenalty,
      max_tokens: options.maxTokens,
      stop: options.stop?.length ? options.stop : undefined,
    };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openRouterApiKey}`,
      },
      body: JSON.stringify(
        Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
      ),
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      logger.error('OpenRouter request failed', {
        status: response.status,
        durationMs: Date.now() - startedAt,
        model: config.openRouterModel,
        stopCount: payload.stop?.length ?? 0,
        error: body.slice(0, 1000),
      });
      throw new Error(`OpenRouter request failed with status ${response.status}: ${body}`);
    }

    const data = (await response.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      logger.error('OpenRouter returned empty response', {
        model: config.openRouterModel,
        durationMs: Date.now() - startedAt,
      });
      throw new Error('OpenRouter returned empty response');
    }
    logger.info('OpenRouter response', {
      durationMs: Date.now() - startedAt,
      model: config.openRouterModel,
      messagesCount: messages.length,
      stopCount: payload.stop?.length ?? 0,
    });
    return String(content).trim();
  }
}

export const llmService = new LLMService();
