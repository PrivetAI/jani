import { LLMMessage, LLMRequestOptions } from './llm/types.js';
import { OpenRouterProvider } from './llm/providers/open-router-provider.js';
import { GeminiProvider } from './llm/providers/gemini-provider.js';
import { OpenAIProvider } from './llm/providers/openai-provider.js';

export { LLMMessage, LLMRequestOptions };

export class LLMService {
  private openRouter = new OpenRouterProvider();
  private gemini = new GeminiProvider();
  private openai = new OpenAIProvider();

  async generateReply(messages: LLMMessage[], options: LLMRequestOptions = {}): Promise<string> {
    const provider = options.provider ?? 'openrouter';

    if (provider === 'gemini') {
      return this.gemini.generateReply(messages, options);
    }

    if (provider === 'openai') {
      return this.openai.generateReply(messages, options);
    }

    return this.openRouter.generateReply(messages, options);
  }
}

export const llmService = new LLMService();
