import { config } from '../../../config.js';
import { logger } from '../../../logger.js';
import { LLMMessage, LLMProvider, LLMRequestOptions } from '../types.js';

export class GeminiProvider implements LLMProvider {
    async generateReply(messages: LLMMessage[], options: LLMRequestOptions = {}): Promise<string> {
        const startedAt = Date.now();
        const model = options.model;

        if (!model) {
            throw new Error('Gemini model is not specified');
        }

        if (!config.geminiApiKey) {
            throw new Error('Gemini API Key is missing');
        }

        // 1. Separate system prompts from content messages
        const systemParts = messages
            .filter((m) => m.role === 'system')
            .map((m) => ({ text: m.content }));

        const contents = messages
            .filter((m) => m.role !== 'system')
            .map((m) => ({
                role: m.role === 'user' ? 'user' : 'model',
                parts: [{ text: m.content }],
            }));

        // 2. Build payload
        const generationConfig: any = {
            temperature: options.temperature ?? config.llmDefaultTemperature,
            topP: options.topP ?? config.llmDefaultTopP,
            stopSequences: options.stop,
        };

        // Only add maxOutputTokens if it's a positive number (0 means no limit)
        if (options.maxTokens && options.maxTokens > 0) {
            generationConfig.maxOutputTokens = options.maxTokens;
        }

        const payload: any = {
            contents,
            generationConfig,
            safetySettings: [
                { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
                { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
            ],
        };

        if (systemParts.length > 0) {
            payload.systemInstruction = {
                parts: systemParts,
            };
        }

        // Log full input (all messages)
        logger.llmRequest('Gemini INPUT', {
            model,
            temperature: generationConfig.temperature,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
        });

        // Use proxy URL if configured (for geo-blocked regions like Russia)
        const baseUrl = config.geminiProxyUrl || 'https://generativelanguage.googleapis.com';
        const url = `${baseUrl}/v1beta/models/${model}:generateContent?key=${config.geminiApiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        const rawBody = await response.text();
        const durationMs = Date.now() - startedAt;

        if (!response.ok) {
            logger.error('Gemini ERROR', {
                durationMs,
                status: response.status,
                error: rawBody,
            });
            throw new Error(`Gemini request failed with status ${response.status}: ${rawBody}`);
        }

        let data: any;
        try {
            data = JSON.parse(rawBody);
        } catch (error) {
            logger.error('Gemini PARSE ERROR', {
                durationMs,
                error: (error as Error).message,
                rawBody,
            });
            throw new Error('Failed to parse Gemini response');
        }

        // Extract content
        // Gemini response format: { candidates: [ { content: { parts: [ { text: "..." } ] } } ] }
        const candidate = data.candidates?.[0];
        const content = candidate?.content?.parts?.[0]?.text;

        if (!content) {
            const finishReason = candidate?.finishReason;
            logger.error('Gemini EMPTY RESPONSE', {
                durationMs,
                finishReason,
                rawBody,
            });

            if (finishReason === 'SAFETY') {
                throw new Error('Gemini blocked response due to safety settings');
            }
            throw new Error('Gemini returned empty response');
        }

        // Log full output (complete response)
        logger.llmResponse('Gemini OUTPUT', {
            durationMs,
            usage: data.usageMetadata ?? null,
            content: String(content).trim(),
        });

        return String(content).trim();
    }
}
