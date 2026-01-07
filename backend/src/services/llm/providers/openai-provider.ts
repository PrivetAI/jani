import { config } from '../../../config.js';
import { logger } from '../../../logger.js';
import { LLMMessage, LLMProvider, LLMRequestOptions } from '../types.js';

export class OpenAIProvider implements LLMProvider {
    async generateReply(messages: LLMMessage[], options: LLMRequestOptions = {}): Promise<string> {
        const startedAt = Date.now();
        const model = options.model;

        if (!model) {
            throw new Error('OpenAI model is not specified');
        }

        if (!config.openaiApiKey) {
            throw new Error('OpenAI API Key is missing');
        }

        const payload = {
            model,
            messages: messages.map(m => ({
                role: m.role,
                content: m.content,
            })),
            temperature: options.temperature ?? config.llmDefaultTemperature,
            top_p: options.topP ?? config.llmDefaultTopP,
            max_tokens: options.maxTokens || undefined,
            stop: options.stop?.length ? options.stop : undefined,
        };

        // Log full LLM request
        logger.llmRequest('OpenAI INPUT', {
            model: payload.model,
            messagesCount: messages.length,
            messages: messages.map((m, i) => ({ index: i, role: m.role, content: m.content })),
            temperature: payload.temperature,
            maxTokens: payload.max_tokens,
        });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.openaiApiKey}`,
            },
            body: JSON.stringify(
                Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
            ),
        });

        const rawBody = await response.text();
        const durationMs = Date.now() - startedAt;
        const baseLog = {
            durationMs,
            model,
            stopCount: payload.stop?.length ?? 0,
        };

        if (!response.ok) {
            logger.error('OpenAI request failed', {
                ...baseLog,
                status: response.status,
                error: rawBody.slice(0, 1000),
            });
            throw new Error(`OpenAI request failed with status ${response.status}: ${rawBody}`);
        }

        let data: any;
        try {
            data = JSON.parse(rawBody);
        } catch (error) {
            logger.error('OpenAI response parse failed', {
                ...baseLog,
                error: (error as Error).message,
                rawBody: rawBody.slice(0, 1000),
            });
            throw new Error('Failed to parse OpenAI response');
        }

        const choice = data.choices?.[0];
        const content = choice?.message?.content;
        if (!content) {
            logger.error('OpenAI returned empty response', {
                ...baseLog,
                choicesCount: Array.isArray(data.choices) ? data.choices.length : 0,
                finishReason: choice?.finish_reason ?? null,
                rawBody: rawBody.slice(0, 1000),
            });
            throw new Error('OpenAI returned empty response');
        }

        logger.llmResponse('OpenAI OUTPUT', {
            ...baseLog,
            messagesCount: messages.length,
            finishReason: choice?.finish_reason ?? null,
            usage: data.usage ?? null,
            content: String(content).trim(),
        });

        return String(content).trim();
    }
}
