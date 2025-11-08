import { PrismaClient, DialogStatus, MessageRole, SubscriptionTier } from '@prisma/client';
import {
  applyActions,
  appendMessage,
  decrementEffectMessages,
  getCharacter,
  getDialog,
  getPrismaClient,
  getSubscriptionTier,
  incrementQuota,
  listActiveEffects,
  retrieveMemories,
  storeMemory,
  updateSummary,
} from '@jani/db';
import {
  ActionEnvelopeAction,
  Character,
  Dialog,
  Message,
  OrchestratorHandleMessageInput,
  OrchestratorHandleMessageResult,
} from '@jani/shared';

interface ComposeContext {
  dialog: Dialog & { messages: Message[] };
  character: Character;
  lastPairs: Array<{ user: string; assistant: string }>;
  summary: string;
  memoryFacts: string[];
  effects: Record<string, unknown>[];
  tier: SubscriptionTier;
}

const summariseMessages = (dialog: Dialog & { messages: Message[] }): string => {
  const lastMessages = dialog.messages.slice(-8);
  if (!lastMessages.length) {
    return '';
  }
  return lastMessages
    .map((message) => `${message.role === MessageRole.User ? 'Пользователь' : 'Ассистент'}: ${message.content}`)
    .join(' \n');
};

const deriveLastPairs = (dialog: Dialog & { messages: Message[] }): Array<{ user: string; assistant: string }> => {
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
  private readonly prisma: PrismaClient;

  constructor(prisma?: PrismaClient) {
    this.prisma = prisma ?? getPrismaClient();
  }

  public async handleMessage(input: OrchestratorHandleMessageInput): Promise<OrchestratorHandleMessageResult> {
    const dialogRecord = await getDialog(this.prisma, input.dialogId);
    if (!dialogRecord) {
      throw new Error(`Dialog ${input.dialogId} not found`);
    }
    const characterRecord = await getCharacter(this.prisma, dialogRecord.characterId);
    if (!characterRecord) {
      throw new Error(`Character ${dialogRecord.characterId} not found`);
    }

    await incrementQuota(this.prisma, dialogRecord.userId, 1);
    await appendMessage(this.prisma, { dialogId: dialogRecord.id, role: MessageRole.User, content: input.text });
    const updatedDialogRecord = await getDialog(this.prisma, dialogRecord.id);
    if (!updatedDialogRecord) {
      throw new Error(`Dialog ${dialogRecord.id} not found after append`);
    }

    const dialog: Dialog & { messages: Message[] } = {
      ...(updatedDialogRecord as Dialog),
      messages: updatedDialogRecord.messages.map((message) => ({
        id: message.id,
        dialogId: message.dialogId,
        role: message.role as MessageRole,
        content: message.content,
        tokensIn: message.tokensIn ?? undefined,
        tokensOut: message.tokensOut ?? undefined,
        createdAt: message.createdAt,
      })),
    } as Dialog & { messages: Message[] };

    const summary = summariseMessages(dialog);
    const lastPairs = deriveLastPairs(dialog);
    const tier = await getSubscriptionTier(this.prisma, dialog.userId);
    const activeEffects = await listActiveEffects(this.prisma, dialog.userId, dialog.id);
    const effects = activeEffects.map((effect) => effect.effect as Record<string, unknown>);
    const topK = computeMemoryTopK(tier, effects);
    const memories = topK ? await retrieveMemories(this.prisma, dialog.userId, dialog.characterId, topK) : [];

    const context: ComposeContext = {
      dialog,
      character: characterRecord as Character,
      lastPairs,
      summary,
      memoryFacts: memories,
      effects,
      tier,
    };
    const result = craftResponse(context, input.text);

    await appendMessage(this.prisma, {
      dialogId: dialog.id,
      role: MessageRole.Assistant,
      content: result.text,
      tokensOut: 120,
    });
    await updateSummary(this.prisma, dialog.id, summary);
    if (summary) {
      await storeMemory(this.prisma, {
        userId: dialog.userId,
        characterId: dialog.characterId,
        text: summary,
        embedding: [Math.random(), Math.random()],
      });
    }
    await this.applyEffects(dialog.userId, dialog.id, result.actions);
    await decrementEffectMessages(this.prisma, dialog.userId, dialog.id);

    const tokensOut = 120;

    return {
      userVisibleText: result.text,
      actions: result.actions,
      summary,
      tokensOut,
    };
  }

  public async cancel(dialogId: string): Promise<void> {
    await this.prisma.dialog
      .update({
        where: { id: dialogId },
        data: { status: DialogStatus.closed },
      })
      .catch(() => undefined);
  }

  public async applyEffects(userId: string, dialogId: string, actions: ActionEnvelopeAction[]): Promise<void> {
    await applyActions(this.prisma, userId, dialogId, actions);
  }

  public async storeMemory(userId: string, characterId: string, text: string): Promise<void> {
    await storeMemory(this.prisma, { userId, characterId, text, embedding: [Math.random(), Math.random()] });
  }
}
