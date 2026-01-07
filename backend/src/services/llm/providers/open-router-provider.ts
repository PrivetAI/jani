import { config } from '../../../config.js';
import { logger } from '../../../logger.js';
import { LLMMessage, LLMProvider, LLMRequestOptions } from '../types.js';

const pickMessageContent = (message: any) => {
    if (!message) return '';
    const { content, reasoning_content: reasoningContent, reasoning, reasoning_details: reasoningDetails } = message as any;

    // First, try main content
    if (typeof content === 'string' && content.trim()) {
        return content.trim();
    }

    if (Array.isArray(content)) {
        const text = content
            .map((part: any) => {
                if (!part) return '';
                if (typeof part === 'string') return part;
                if (typeof part.text === 'string') return part.text;
                return '';
            })
            .filter(Boolean)
            .join('\n')
            .trim();
        if (text) return text;
    }

    // Fallback to reasoning_content (older format)
    if (typeof reasoningContent === 'string' && reasoningContent.trim()) {
        return reasoningContent.trim();
    }

    // Fallback to reasoning (newer deepseek format)
    if (typeof reasoning === 'string' && reasoning.trim()) {
        return reasoning.trim();
    }

    // Fallback to reasoning_details array
    if (Array.isArray(reasoningDetails) && reasoningDetails.length > 0) {
        const text = reasoningDetails
            .map((d: any) => d?.text || '')
            .filter(Boolean)
            .join('\n')
            .trim();
        if (text) return text;
    }

    return '';
};

export class OpenRouterProvider implements LLMProvider {
    async generateReply(messages: LLMMessage[], options: LLMRequestOptions = {}): Promise<string> {
        const startedAt = Date.now();

        const model = options.model;

        if (!model) {
            throw new Error('OpenRouter model is not specified');
        }

        // If no API key is configured (and we are here), it's a critical error for this provider
        if (!config.openRouterApiKey) {
            throw new Error('OpenRouter API Key is missing');
        }

        const payload = {
            model,
            messages,
            temperature: options.temperature ?? config.llmDefaultTemperature,
            top_p: options.topP ?? config.llmDefaultTopP,
            repetition_penalty: options.repetitionPenalty ?? config.llmDefaultRepetitionPenalty,
            max_tokens: options.maxTokens,
            stop: options.stop?.length ? options.stop : undefined,
        };

        // Log full LLM request
        logger.llmRequest('Sending to OpenRouter', {
            model: payload.model,
            messagesCount: messages.length,
            messages: messages.map((m, i) => ({ index: i, role: m.role, content: m.content })),
            temperature: payload.temperature,
            maxTokens: payload.max_tokens,
        });

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

        const rawBody = await response.text();
        const durationMs = Date.now() - startedAt;
        const baseLog = {
            durationMs,
            model,
            stopCount: payload.stop?.length ?? 0,
        };

        if (!response.ok) {
            logger.error('OpenRouter request failed', {
                ...baseLog,
                status: response.status,
                error: rawBody.slice(0, 1000),
            });
            throw new Error(`OpenRouter request failed with status ${response.status}: ${rawBody}`);
        }

        let data: any;
        try {
            data = JSON.parse(rawBody);
        } catch (error) {
            logger.error('OpenRouter response parse failed', {
                ...baseLog,
                error: (error as Error).message,
                rawBody: rawBody.slice(0, 1000),
            });
            throw new Error('Failed to parse OpenRouter response');
        }

        const choice = data.choices?.[0];
        const content = pickMessageContent(choice?.message);
        if (!content) {
            logger.error('OpenRouter returned empty response', {
                ...baseLog,
                choicesCount: Array.isArray(data.choices) ? data.choices.length : 0,
                finishReason: choice?.finish_reason ?? null,
                rawBody: rawBody.slice(0, 1000),
            });
            throw new Error('OpenRouter returned empty response');
        }
        logger.llmResponse('OpenRouter response', {
            ...baseLog,
            messagesCount: messages.length,
            finishReason: choice?.finish_reason ?? null,
            usage: data.usage ?? null,
            content: String(content).trim(),
        });
        return String(content).trim();
    }
}
