import { LLMMessage, LLMRequestOptions } from './llm/types.js';
import { OpenRouterProvider } from './llm/providers/open-router-provider.js';
import { GeminiProvider } from './llm/providers/gemini-provider.js';
import { OpenAIProvider } from './llm/providers/openai-provider.js';
import { query } from '../db/pool.js';
import { logger } from '../logger.js';
import { notifyAdminError } from './telegramNotifier.js';

export { LLMMessage, LLMRequestOptions };

interface FallbackModel {
  provider: string;
  model_id: string;
  display_name: string;
}

export class LLMService {
  private openRouter = new OpenRouterProvider();
  private gemini = new GeminiProvider();
  private openai = new OpenAIProvider();

  /**
   * Get the global fallback model from DB
   */
  private async getFallbackModel(): Promise<FallbackModel | null> {
    const result = await query<FallbackModel>(
      'SELECT provider, model_id, display_name FROM allowed_models WHERE is_fallback = TRUE AND is_active = TRUE LIMIT 1'
    );
    return result.rows[0] ?? null;
  }

  /**
   * Execute LLM request with given provider
   */
  private async executeWithProvider(
    provider: string,
    messages: LLMMessage[],
    options: LLMRequestOptions
  ): Promise<string> {
    if (provider === 'gemini') {
      return this.gemini.generateReply(messages, options);
    }
    if (provider === 'openai') {
      return this.openai.generateReply(messages, options);
    }
    return this.openRouter.generateReply(messages, options);
  }

  /**
   * Generate reply with automatic fallback on error
   * - On primary model error: try fallback once, notify admin
   * - On fallback error: notify admin, throw error
   * - Fallback is per-request, does not persist between requests
   */
  async generateReply(messages: LLMMessage[], options: LLMRequestOptions = {}): Promise<string> {
    const primaryProvider = options.provider ?? 'openrouter';
    const primaryModel = options.model;

    try {
      return await this.executeWithProvider(primaryProvider, messages, options);
    } catch (primaryError) {
      logger.error('Primary LLM failed, attempting fallback', {
        provider: primaryProvider,
        model: primaryModel,
        error: (primaryError as Error).message,
      });

      // Get global fallback model
      const fallback = await this.getFallbackModel();

      if (!fallback) {
        // No fallback configured - notify admin and throw
        logger.error('No fallback model configured');
        notifyAdminError({
          error: primaryError as Error,
          provider: primaryProvider,
          model: primaryModel,
        }).catch(() => { }); // fire-and-forget
        throw primaryError;
      }

      // Check if fallback is the same as primary (avoid infinite loop)
      if (fallback.provider === primaryProvider && fallback.model_id === primaryModel) {
        logger.error('Fallback model is same as primary, cannot retry');
        notifyAdminError({
          error: primaryError as Error,
          provider: primaryProvider,
          model: primaryModel,
        }).catch(() => { });
        throw primaryError;
      }

      // Try fallback
      try {
        logger.info('Switching to fallback model', {
          fallbackProvider: fallback.provider,
          fallbackModel: fallback.model_id,
        });

        const fallbackOptions: LLMRequestOptions = {
          ...options,
          provider: fallback.provider as 'openrouter' | 'gemini' | 'openai',
          model: fallback.model_id,
        };

        const result = await this.executeWithProvider(fallback.provider, messages, fallbackOptions);

        // Notify admin that fallback was used (success case)
        notifyAdminError({
          error: `⚠️ Fallback triggered (успешно)\n\nОсновная модель упала: ${(primaryError as Error).message}\nИспользован fallback: ${fallback.display_name}`,
          provider: primaryProvider,
          model: primaryModel,
        }).catch(() => { });

        return result;
      } catch (fallbackError) {
        // Both primary and fallback failed - notify admin
        logger.error('Fallback LLM also failed', {
          fallbackProvider: fallback.provider,
          fallbackModel: fallback.model_id,
          error: (fallbackError as Error).message,
        });

        notifyAdminError({
          error: `🔥 Полный отказ LLM\n\nОсновная: ${primaryProvider}/${primaryModel} - ${(primaryError as Error).message}\nFallback: ${fallback.display_name} - ${(fallbackError as Error).message}`,
          provider: fallback.provider,
          model: fallback.model_id,
        }).catch(() => { });

        throw fallbackError;
      }
    }
  }
}

export const llmService = new LLMService();

