import { InMemoryDatabase } from '@jani/db';
import {
  ActionEnvelopeAction,
  Character,
  Dialog,
  MessageRole,
  OrchestratorHandleMessageInput,
  OrchestratorHandleMessageResult,
  SubscriptionTier,
} from '@jani/shared';

interface ComposeContext {
  dialog: Dialog;
  character: Character;
  lastPairs: Array<{ user: string; assistant: string }>;
  summary: string;
  memoryFacts: string[];
  effects: Record<string, unknown>[];
  tier: SubscriptionTier;
}

const summariseMessages = (dialog: Dialog): string => {
  const lastMessages = dialog.messages.slice(-8);
  if (!lastMessages.length) {
    return '';
  }
  return lastMessages
    .map((message) => `${message.role === MessageRole.User ? 'Пользователь' : 'Ассистент'}: ${message.content}`)
    .join(' \n');
};

const deriveLastPairs = (dialog: Dialog): Array<{ user: string; assistant: string }> => {
  const pairs: Array<{ user: string; assistant: string }> = [];
  let current: { user?: string; assistant?: string } = {};
  for (const message of dialog.messages.slice(-8)) {
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

const craftResponse = (context: ComposeContext, userText: string): { text: string; actions: ActionEnvelopeAction[] } => {
  const { character, summary, memoryFacts, tier } = context;
  const activeStory = character.stories.find((story) => story.id === context.dialog.storyId);
  const storyNodes = (activeStory?.arcJson?.nodes as Array<Record<string, unknown>> | undefined) ?? [];
  const offerActions: ActionEnvelopeAction[] = [];
  for (const node of storyNodes) {
    if (typeof node !== 'object' || !node) {
      continue;
    }
    const offer = node.offer_item as { item_slug: string; text_ru: string } | undefined;
    if (!offer) {
      continue;
    }
    if (userText.toLowerCase().includes('ключ') || userText.toLowerCase().includes('двер')) {
      offerActions.push({ type: 'OFFER_ITEM', item_slug: offer.item_slug, reason_ru: offer.text_ru });
    }
  }
  const storyLine = activeStory ? `История: ${activeStory.title}.` : '';
  const memoryLine = memoryFacts.length ? `Помню: ${memoryFacts.join(' | ')}.` : '';
  const tierLine = tier === SubscriptionTier.Free ? 'У тебя пока бесплатный доступ.' : `Статус подписки: ${tier}.`;
  const text = [
    `${character.name}: ${storyLine}`.trim(),
    summary ? `Кратко: ${summary}` : null,
    memoryLine || null,
    tierLine,
    `Ответ: ${userText.includes('привет') ? 'Привет, расскажи, что тебя привело.' : 'Продолжим расследование.'}`,
  ]
    .filter((part): part is string => Boolean(part))
    .join('\n');
  return { text, actions: offerActions };
};

export class OrchestratorService {
  constructor(private readonly db: InMemoryDatabase) {}

  public async handleMessage(input: OrchestratorHandleMessageInput): Promise<OrchestratorHandleMessageResult> {
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
    const summary = summariseMessages(updatedDialog);
    const lastPairs = deriveLastPairs(updatedDialog);
    const tier = this.db.getSubscriptionTier(dialog.userId);
    const effects = this.db.listActiveEffects(dialog.userId, dialog.id).map((effect) => effect.effect);
    const topK = computeMemoryTopK(tier, effects);
    const memories = topK ? this.db.retrieveMemories(dialog.userId, dialog.characterId, topK) : [];

    const context: ComposeContext = {
      dialog: updatedDialog,
      character,
      lastPairs,
      summary,
      memoryFacts: memories,
      effects,
      tier,
    };
    const result = craftResponse(context, input.text);

    this.db.appendMessage({ dialogId: dialog.id, role: MessageRole.Assistant, content: result.text, tokensOut: 120 });
    this.db.updateSummary(dialog.id, summary);
    if (summary) {
      this.db.storeMemory({ userId: dialog.userId, characterId: dialog.characterId, text: summary, embedding: [Math.random(), Math.random()] });
    }
    await this.applyEffects(dialog.userId, dialog.id, result.actions);
    this.db.decrementEffectMessages(dialog.userId, dialog.id);

    const tokensOut = 120;

    return {
      userVisibleText: result.text,
      actions: result.actions,
      summary,
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
