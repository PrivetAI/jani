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
  fallback_priority: number;
}

export class LLMService {
  private openRouter = new OpenRouterProvider();
  private gemini = new GeminiProvider();
  private openai = new OpenAIProvider();

  /**
   * Get all fallback models ordered by priority (1, 2, ...)
   */
  private async getFallbackModels(): Promise<FallbackModel[]> {
    const result = await query<FallbackModel>(
      'SELECT provider, model_id, display_name, fallback_priority FROM allowed_models WHERE fallback_priority IS NOT NULL AND is_active = TRUE ORDER BY fallback_priority ASC'
    );
    return result.rows;
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
   * Generate reply with automatic fallback chain on error
   * Flow: primary → fallback1 → fallback2 → error
   */
  async generateReply(messages: LLMMessage[], options: LLMRequestOptions = {}): Promise<string> {
    const primaryProvider = options.provider ?? 'openrouter';
    const primaryModel = options.model;

    try {
      return await this.executeWithProvider(primaryProvider, messages, options);
    } catch (primaryError) {
      logger.error('Primary LLM failed, attempting fallback chain', {
        provider: primaryProvider,
        model: primaryModel,
        error: (primaryError as Error).message,
      });

      // Get all fallback models ordered by priority
      const fallbacks = await this.getFallbackModels();

      // Filter out fallbacks that match primary model
      const availableFallbacks = fallbacks.filter(
        fb => !(fb.provider === primaryProvider && fb.model_id === primaryModel)
      );

      if (availableFallbacks.length === 0) {
        logger.error('No fallback models available');
        notifyAdminError({
          error: primaryError as Error,
          provider: primaryProvider,
          model: primaryModel,
        }).catch(() => { });
        throw primaryError;
      }

      // Try each fallback in priority order
      const errors: string[] = [`Основная ${primaryProvider}/${primaryModel}: ${(primaryError as Error).message}`];

      for (let i = 0; i < availableFallbacks.length; i++) {
        const fb = availableFallbacks[i];
        try {
          logger.info(`Trying fallback ${fb.fallback_priority}`, {
            fallbackProvider: fb.provider,
            fallbackModel: fb.model_id,
          });

          const fbOptions: LLMRequestOptions = {
            ...options,
            provider: fb.provider as 'openrouter' | 'gemini' | 'openai',
            model: fb.model_id,
          };

          const result = await this.executeWithProvider(fb.provider, messages, fbOptions);

          logger.info(`Fallback ${fb.fallback_priority} succeeded`, {
            fallbackProvider: fb.provider,
            fallbackModel: fb.model_id,
          });

          return result;
        } catch (fbError) {
          logger.error(`Fallback ${fb.fallback_priority} failed`, {
            fallbackProvider: fb.provider,
            fallbackModel: fb.model_id,
            error: (fbError as Error).message,
          });
          errors.push(`FB${fb.fallback_priority} ${fb.display_name}: ${(fbError as Error).message}`);
        }
      }

      // All fallbacks exhausted
      notifyAdminError({
        error: `🔥 Полный отказ LLM\n\n${errors.join('\n')}`,
        provider: primaryProvider,
        model: primaryModel,
      }).catch(() => { });

      throw primaryError;
    }
  }
}

export const llmService = new LLMService();

