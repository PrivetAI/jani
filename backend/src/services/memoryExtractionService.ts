import { llmService, type LLMMessage } from './llmService.js';
import { addMemory, getMemories, enforceMemoryLimit, type MemoryCategory } from '../modules/memories.js';
import { logger } from '../logger.js';

export interface ExtractedFact {
    content: string;
    category: MemoryCategory;
    importance: number;
}

const EXTRACTION_PROMPT = `Analyze the conversation and extract NEW FACTS about the user.
Return JSON array of facts. Only include facts NOT already in existing memories.
Each fact: { "content": "short fact", "category": "fact|preference|emotion|relationship", "importance": 1-10 }

Categories:
- fact: objective info (name, job, location)
- preference: likes/dislikes  
- emotion: emotional state
- relationship: how they relate to the character

Rules:
- Only extract CLEAR facts explicitly stated by user
- Skip vague or uncertain info
- Importance: 10 = critical (name), 5 = useful, 1 = trivial
- Max 3 facts per exchange
- Return [] if nothing new

Existing memories: {EXISTING}

Conversation:
{DIALOG}

Return only valid JSON array:`;

/**
 * Extract facts from dialog using LLM
 */
export async function extractFactsFromDialog(
    messages: LLMMessage[],
    existingMemories: string[]
): Promise<ExtractedFact[]> {
    if (messages.length < 2) return [];

    // Only analyze user messages for facts
    const userMessages = messages.filter(m => m.role === 'user');
    if (!userMessages.length) return [];

    const dialog = messages
        .slice(-6) // Last few exchanges
        .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
        .join('\n');

    const existingText = existingMemories.length
        ? existingMemories.join('; ')
        : 'none';

    const prompt = EXTRACTION_PROMPT
        .replace('{EXISTING}', existingText)
        .replace('{DIALOG}', dialog);

    try {
        const response = await llmService.generateReply(
            [{ role: 'user', content: prompt }],
            { temperature: 0.3, maxTokens: 300 }
        );

        // Parse JSON response
        const jsonMatch = response.match(/\[[\s\S]*\]/);
        if (!jsonMatch) return [];

        const parsed = JSON.parse(jsonMatch[0]) as ExtractedFact[];

        // Validate and filter
        return parsed.filter(f =>
            f.content &&
            typeof f.content === 'string' &&
            f.content.length > 3 &&
            f.content.length < 200 &&
            ['fact', 'preference', 'emotion', 'relationship'].includes(f.category) &&
            typeof f.importance === 'number' &&
            f.importance >= 1 && f.importance <= 10
        ).slice(0, 3);
    } catch (error) {
        logger.error('Memory extraction failed', { error: (error as Error).message });
        return [];
    }
}

/**
 * Extract and save new facts for a user-character pair
 * Should be called after generating a reply (async, non-blocking)
 */
export async function extractAndSaveMemories(
    userId: number,
    characterId: number,
    messages: LLMMessage[]
): Promise<number> {
    try {
        // Get existing memories for deduplication
        const existingMemories = await getMemories(userId, characterId);
        const existingContents = existingMemories.map(m => m.content);

        // Extract new facts
        const facts = await extractFactsFromDialog(messages, existingContents);

        if (!facts.length) return 0;

        // Save new facts
        let saved = 0;
        for (const fact of facts) {
            // Simple deduplication check
            const isDuplicate = existingContents.some(existing =>
                existing.toLowerCase().includes(fact.content.toLowerCase()) ||
                fact.content.toLowerCase().includes(existing.toLowerCase())
            );

            if (!isDuplicate) {
                await addMemory(userId, characterId, fact.content, fact.category, fact.importance);
                saved++;
                logger.info('Memory auto-saved', {
                    userId,
                    characterId,
                    category: fact.category,
                    importance: fact.importance,
                    content: fact.content.slice(0, 50),
                });
            }
        }

        return saved;
    } catch (error) {
        logger.error('Failed to extract and save memories', {
            userId,
            characterId,
            error: (error as Error).message,
        });
        return 0;
    }
}
