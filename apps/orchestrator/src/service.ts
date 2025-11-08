import { trace, SpanStatusCode } from '@opentelemetry/api';
import { InMemoryDatabase } from '@jani/db';
import {
  ActionEnvelopeAction,
  Character,
  Dialog,
  DialogStatus,
  MessageRole,
  OrchestratorHandleMessageInput,
  OrchestratorHandleMessageResult,
  SubscriptionTier,
} from '@jani/shared';
import { openRouterClient, parseActionEnvelope } from '@jani/utils';
import { buildPromptMessages, PromptContext } from './prompt';
import { reduceDialogSummary } from './summary';

const tracer = trace.getTracer('orchestrator.service');

interface ComposeContext {
  dialog: Dialog;
  character: Character;
  lastPairs: Array<{ user: string; assistant: string }>;
  summary: string;
  memoryFacts: string[];
  model: string;
  temperature: number;
}

const deriveLastPairs = (dialog: Dialog): Array<{ user: string; assistant: string }> => {
  const pairs: Array<{ user: string; assistant: string }> = [];
  let current: { user?: string; assistant?: string } = {};
  for (const message of dialog.messages) {
    if (message.role === MessageRole.User) {
      if (current.user && !current.assistant) {
        pairs.push({ user: current.user, assistant: current.assistant ?? '' });
      }
      current = { user: message.content };
    } else if (message.role === MessageRole.Assistant) {
      if (!current.user) {
        current.user = '';
      }
      current.assistant = message.content;
      pairs.push({ user: current.user ?? '', assistant: current.assistant ?? '' });
      current = {};
    }
  }
  if (current.user) {
    pairs.push({ user: current.user, assistant: current.assistant ?? '' });
  }
  return pairs.slice(-4);
};

const computeMemoryTopK = (tier: SubscriptionTier, effects: Record<string, unknown>[]): number => {
  const base: Record<SubscriptionTier, number> = {
    [SubscriptionTier.Free]: 0,
    [SubscriptionTier.Plus]: 3,
    [SubscriptionTier.Pro]: 5,
    [SubscriptionTier.Ultra]: 7,
  };
  const boost = effects
    .filter((effect) => effect.type === 'memory.boost')
    .reduce((acc, effect) => acc + (effect.topK as number | undefined ?? 0), 0);
  return base[tier] + boost;
};

const shouldAllowMemory = (tier: SubscriptionTier, effects: Record<string, unknown>[], hasMemoryPack: boolean): boolean => {
  if (hasMemoryPack) {
    return true;
  }
  if (effects.some((effect) => effect.type === 'memory.boost')) {
    return true;
  }
  return tier !== SubscriptionTier.Free;
};

const extractUserVisibleText = (raw: string): string | null => {
  const match = raw.match(/"user_visible_text"\s*:\s*"((?:\\.|[^\\"])*)"/);
  if (!match) {
    return null;
  }
  return match[1]
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\');
};

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export class OrchestratorService {
  constructor(private readonly db: InMemoryDatabase, private readonly llm = openRouterClient) {}

  public async handleMessage(input: OrchestratorHandleMessageInput): Promise<OrchestratorHandleMessageResult> {
    return tracer.startActiveSpan('orchestrator.handleMessage', async (span) => {
      try {
        const result = await this.processMessage(input);
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

  public async processMessage(input: OrchestratorHandleMessageInput): Promise<OrchestratorHandleMessageResult> {
    const dialog = this.db.getDialog(input.dialogId);
    if (!dialog) {
      throw new Error(`Dialog ${input.dialogId} not found`);
    }
    const character = this.db.getCharacter(dialog.characterId);
    if (!character) {
      throw new Error(`Character ${dialog.characterId} not found`);
    }

    this.db.incrementQuota(dialog.userId, 1);
    this.db.appendMessage({ dialogId: dialog.id, role: MessageRole.User, content: input.text });
    const updatedDialog = this.db.getDialog(dialog.id)!;
    const tier = this.db.getSubscriptionTier(dialog.userId);
    const effects = this.db.listActiveEffects(dialog.userId, dialog.id).map((effect) => effect.effect);
    const hasMemoryPack = this.db.hasMemoryPack(dialog.userId);
    const allowMemory = shouldAllowMemory(tier, effects, hasMemoryPack);
    const topK = allowMemory ? computeMemoryTopK(tier, effects) : 0;
    const memories = topK ? this.db.retrieveMemories(dialog.userId, dialog.characterId, topK) : [];

    const activeVersion = character.versions.find((version) => version.isActive) ?? character.versions[0];
    const model = (activeVersion?.modelPreset?.model as string | undefined) ?? 'openrouter/auto';
    const temperature = (activeVersion?.modelPreset?.temperature as number | undefined) ?? 0.7;

    const summary = reduceDialogSummary(dialog.summary ?? null, updatedDialog);
    const context: ComposeContext = {
      dialog: updatedDialog,
      character,
      lastPairs: deriveLastPairs(updatedDialog),
      summary,
      memoryFacts: memories,
      model,
      temperature,
    };

    const placeholder = this.db.appendMessage({ dialogId: dialog.id, role: MessageRole.Assistant, content: '…', tokensOut: 0 });

    const promptContext: PromptContext = {
      dialog: context.dialog,
      character: context.character,
      summary: context.summary,
      memoryFacts: context.memoryFacts,
      lastPairs: context.lastPairs,
    };

    let streamingBuffer = '';
    let lastUpdate = 0;
    const throttleMs = 200;
    const updatePlaceholder = (force = false) => {
      const visible = extractUserVisibleText(streamingBuffer);
      if (visible === null) {
        return;
      }
      const now = Date.now();
      if (!force && now - lastUpdate < throttleMs) {
        return;
      }
      this.db.updateMessage(dialog.id, placeholder.id, { content: visible });
      lastUpdate = now;
    };

    const messages = buildPromptMessages(promptContext, input.text);
    const result = await this.llm.streamCompletion({
      model: context.model,
      temperature: context.temperature,
      messages,
      onToken: (chunk) => {
        streamingBuffer += chunk;
        updatePlaceholder();
      },
    });
    streamingBuffer = result.rawText;
    updatePlaceholder(true);

    const envelope = result.envelope ?? parseActionEnvelope(result.rawText.trim());
    const finalText = envelope.user_visible_text;
    const tokensOut = estimateTokens(finalText);
    this.db.updateMessage(dialog.id, placeholder.id, { content: finalText, tokensOut });

    const latestDialog = this.db.getDialog(dialog.id)!;
    const latestSummary = envelope.summary ?? reduceDialogSummary(dialog.summary ?? null, latestDialog);
    this.db.updateSummary(dialog.id, latestSummary);

    if (allowMemory && latestSummary) {
      this.db.storeMemory({
        userId: dialog.userId,
        characterId: dialog.characterId,
        text: latestSummary,
        embedding: [Math.random(), Math.random()],
      });
    }

    await this.applyEffects(dialog.userId, dialog.id, envelope.actions ?? []);
    this.db.decrementEffectMessages(dialog.userId, dialog.id);

    return {
      userVisibleText: finalText,
      actions: envelope.actions ?? [],
      summary: latestSummary ?? '',
      tokensOut,
    };
  }

  public async cancel(dialogId: string): Promise<void> {
    const dialog = this.db.getDialog(dialogId);
    if (!dialog) {
      return;
    }
    dialog.status = DialogStatus.Closed;
  }

  public async applyEffects(userId: string, dialogId: string, actions: ActionEnvelopeAction[]): Promise<void> {
    this.db.applyActions(userId, dialogId, actions);
  }

  public async storeMemory(userId: string, characterId: string, text: string): Promise<void> {
    this.db.storeMemory({ userId, characterId, text, embedding: [Math.random(), Math.random()] });
  }
}
