import crypto from 'node:crypto';
import { TextDecoder } from 'node:util';
import { trace, SpanStatusCode, diag } from '@opentelemetry/api';
import type { ActionEnvelope } from '@jani/shared';
import { PromptCache } from './prompt-cache';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterStreamOptions {
  model: string;
  temperature?: number;
  messages: OpenRouterMessage[];
  cacheKey?: string;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}

export interface OpenRouterStreamResult {
  rawText: string;
  envelope?: ActionEnvelope & { summary?: string | null };
}

const tracer = trace.getTracer('orchestrator.openrouter');

const defaultBaseUrl = 'https://openrouter.ai/api/v1';

const parseEnvelope = (raw: string): OpenRouterStreamResult['envelope'] => {
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && typeof parsed.user_visible_text === 'string') {
      return parsed as ActionEnvelope & { summary?: string | null };
    }
  } catch (error) {
    diag.error('Failed to parse action envelope', error, raw);
  }
  return undefined;
};

export class OpenRouterClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly promptCache: PromptCache<OpenRouterStreamResult> | null;
  private readonly fetchImpl: typeof fetch;

  constructor(options?: { baseUrl?: string; apiKey?: string; cacheTtlMs?: number; fetchImpl?: typeof fetch }) {
    this.baseUrl = options?.baseUrl ?? process.env.OPENROUTER_BASE_URL ?? defaultBaseUrl;
    this.apiKey = options?.apiKey ?? process.env.OPENROUTER_API_KEY ?? '';
    const ttl = Number.parseInt(process.env.OPENROUTER_CACHE_TTL ?? '', 10);
    const cacheTtlMs = options?.cacheTtlMs ?? (Number.isFinite(ttl) && ttl > 0 ? ttl : 30_000);
    this.promptCache = cacheTtlMs > 0 ? new PromptCache<OpenRouterStreamResult>(cacheTtlMs) : null;
    this.fetchImpl = options?.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  public async streamCompletion(options: OpenRouterStreamOptions): Promise<OpenRouterStreamResult> {
    const cacheKey = this.resolveCacheKey(options);
    const cached = this.promptCache?.get(cacheKey);
    if (cached) {
      diag.debug('Serving OpenRouter response from cache', { cacheKey });
      if (cached.envelope && options.onToken) {
        options.onToken(cached.envelope.user_visible_text);
      }
      return cached;
    }

    return tracer.startActiveSpan('openrouter.stream', async (span) => {
      span.setAttribute('openrouter.model', options.model);
      span.setAttribute('openrouter.cached', false);
      try {
        const result = await this.performStreaming(options);
        if (this.promptCache && result.rawText.trim()) {
          this.promptCache.set(cacheKey, result);
        }
        span.setStatus({ code: SpanStatusCode.OK });
        return result;
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (error as Error).message });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private resolveCacheKey(options: OpenRouterStreamOptions): string {
    if (options.cacheKey) {
      return options.cacheKey;
    }
    const hash = crypto.createHash('sha256');
    for (const message of options.messages) {
      hash.update(`${message.role}:${message.content}`);
    }
    return hash.digest('hex');
  }

  private async performStreaming(options: OpenRouterStreamOptions): Promise<OpenRouterStreamResult> {
    const controller = new AbortController();
    if (options.signal) {
      const external = options.signal;
      if (external.aborted) {
        controller.abort(external.reason);
      } else {
        external.addEventListener('abort', () => controller.abort(external.reason), { once: true });
      }
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://jani.app',
      'X-Title': 'Jani Orchestrator',
    };
    if (this.apiKey) {
      headers.Authorization = `Bearer ${this.apiKey}`;
    }

    const response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: options.model,
        stream: true,
        temperature: options.temperature ?? 0.7,
        messages: options.messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenRouter request failed: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let rawText = '';

    const flushTokens = (chunk: string) => {
      if (!chunk) {
        return;
      }
      rawText += chunk;
      options.onToken?.(chunk);
    };

    let doneStreaming = false;
    while (!doneStreaming) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const event of events) {
        const lines = event.split('\n');
        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }
          if (line.startsWith(':')) {
            continue; // keep-alive comment
          }
          if (!line.startsWith('data:')) {
            continue;
          }
          const data = line.slice(5).trim();
          if (data === '[DONE]') {
            reader.cancel().catch(() => undefined);
            buffer = '';
            doneStreaming = true;
            break;
          }
          if (!data) {
            continue;
          }
          try {
            const payload = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = payload.choices?.[0]?.delta?.content ?? '';
            flushTokens(delta);
          } catch (error) {
            diag.warn('Non-JSON SSE payload received from OpenRouter', { data });
            flushTokens(data);
          }
        }
      }
      if (doneStreaming) {
        break;
      }
    }

    const envelope = parseEnvelope(rawText.trim());
    return { rawText, envelope };
  }
}

export const openRouterClient = new OpenRouterClient();

export const parseActionEnvelope = (raw: string): ActionEnvelope & { summary?: string | null } => {
  const envelope = parseEnvelope(raw);
  if (!envelope) {
    throw new Error('Unable to parse action envelope');
  }
  return envelope;
};
