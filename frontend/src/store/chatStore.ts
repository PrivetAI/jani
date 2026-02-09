import { create } from 'zustand';
import { apiRequest } from '../lib/api';
import { socketClient } from '../lib/socket';
import { logger } from '../lib/logger';
import { useUserStore } from './userStore';
import { preprocessMessage } from '../utils/messagePreprocessor';

export interface Character {
    id: number;
    name: string;
    description: string;
    avatarUrl: string | null;
    accessType: 'free' | 'premium';
    grammaticalGender?: 'male' | 'female';
    tags?: string[];
    likesCount?: number;
    greetingMessage?: string | null;
}

export interface DialogMessage {
    id: number;
    role: 'user' | 'assistant';
    text: string;
    createdAt: string;
}

export interface Memory {
    id: number;
    content: string;
    importance: number;
    createdAt: string;
}

export interface Limits {
    remaining: number;
    total: number;
    resetsAt: string | null;
    hasSubscription: boolean;
}

export interface EmotionalState {
    attraction: number;
    trust: number;
    affection: number;
    dominance: number;
    closeness: number;
}

export interface Session {
    emotionalState: EmotionalState;
    messagesCount: number;
    lastMessageAt: string | null;
    createdAt: string;
    llmModel: string | null;
}

interface ChatState {
    characters: Character[];
    myCharacterIds: number[];
    selectedCharacter: Character | null;
    messages: DialogMessage[];
    memories: Memory[];
    limits: Limits | null;
    session: Session | null;
    isLoadingCharacters: boolean;
    isLoadingMessages: boolean;
    isLoadingMoreMessages: boolean;
    hasMoreMessages: boolean;
    nextMessagesCursor: string | null;
    isSending: boolean;
    isTyping: boolean;
    isRegenerating: boolean;
    isLoadingMemories: boolean;
    error: string | null;

    loadCharacters: (initData: string, filters?: { search?: string; tags?: number[]; accessType?: string }) => Promise<void>;
    selectCharacter: (characterId: number, initData: string) => Promise<void>;
    loadMessages: (characterId: number, initData: string) => Promise<void>;
    loadMoreMessages: (characterId: number, initData: string) => Promise<void>;
    sendMessage: (characterId: number, text: string, initData: string) => void;
    initSocket: (initData: string) => void;
    disconnectSocket: () => void;

    // Memory Actions
    loadMemories: (characterId: number, initData: string) => Promise<void>;
    addMemory: (characterId: number, content: string, initData: string) => Promise<void>;
    deleteMemory: (characterId: number, memoryId: number, initData: string) => Promise<void>;

    // Session (read-only, updated by LLM)
    loadLimits: (initData: string) => Promise<void>;
    loadSession: (characterId: number, initData: string) => Promise<void>;
    updateSessionSettings: (characterId: number, settings: { llmModel: string | null }, initData: string) => Promise<void>;
    forgetRecent: (characterId: number, count: number, initData: string) => Promise<void>;
    regenerateLastMessage: (characterId: number, initData: string) => Promise<void>;
    resetChat: (characterId: number, initData: string) => Promise<boolean>;
}

export const useChatStore = create<ChatState>((set, get) => ({
    characters: [],
    myCharacterIds: [],
    selectedCharacter: null,
    messages: [],
    memories: [],
    limits: null,
    session: null,
    isLoadingCharacters: false,
    isLoadingMessages: false,
    isLoadingMoreMessages: false,
    hasMoreMessages: false,
    nextMessagesCursor: null,
    isSending: false,
    isTyping: false,
    isRegenerating: false,
    isLoadingMemories: false,
    error: null,
    // Internal state for socket handlers
    _initData: null as string | null,
    _currentCharacterId: null as number | null,

    initSocket: (initData: string) => {
        set({ _initData: initData } as any);
        socketClient.connect(initData);

        // Listen for typing indicator
        socketClient.on<{ characterId: number }>('chat:typing', (data) => {
            const state = get() as any;
            // Only update typing if it's for the current chat
            if (state._currentCharacterId !== data.characterId) return;
            logger.store('chatStore', 'chat:typing', data);
            set({ isTyping: true });
        });

        // Listen for chat messages
        socketClient.on<{
            characterId: number;
            userMessage: { role: 'user'; text: string; createdAt: string };
            assistantMessage: { role: 'assistant'; text: string; createdAt: string };
            limits: { remaining: number; total: number; resetsAt: string };
            bonusMessages?: number;
        }>('chat:message', (data) => {
            const currentState = get() as any;
            // Only update if message is for the current chat
            if (currentState._currentCharacterId !== data.characterId) return;
            logger.store('chatStore', 'chat:message', data);
            const assistantMsg: DialogMessage = {
                id: Date.now(),
                role: 'assistant',
                text: data.assistantMessage.text,
                createdAt: data.assistantMessage.createdAt,
            };
            set(state => ({
                messages: [...state.messages, assistantMsg],
                isSending: false,
                isTyping: false,
                limits: data.limits ? { ...state.limits!, ...data.limits, hasSubscription: state.limits?.hasSubscription ?? false } : state.limits,
            }));

            // Update bonus messages in userStore
            if (data.bonusMessages !== undefined) {
                useUserStore.getState().updateBonusMessages(data.bonusMessages);
            }

            // Reload session to update relationship_score and messages_count
            const state = get() as any;
            if (state._initData && data.characterId) {
                get().loadSession(data.characterId, state._initData);
            }
        });

        // Listen for errors
        socketClient.on<{ error: string; message: string }>('chat:error', (data) => {
            logger.store('chatStore', 'chat:error', data);
            set({ error: data.message, isSending: false, isTyping: false });
        });
    },

    disconnectSocket: () => {
        socketClient.off('chat:typing');
        socketClient.off('chat:message');
        socketClient.off('chat:error');
        socketClient.disconnect();
    },

    loadCharacters: async (initData: string, filters?: { search?: string; tags?: number[]; accessType?: string }) => {
        set({ isLoadingCharacters: true, error: null });
        try {
            const params = new URLSearchParams();
            if (filters?.search) params.append('search', filters.search);
            if (filters?.accessType && filters.accessType !== 'all') params.append('accessType', filters.accessType);
            if (filters?.tags?.length) params.append('tags', filters.tags.join(','));

            const data = await apiRequest<{ characters: Character[]; myCharacterIds: number[] }>(`/api/characters?${params.toString()}`, { initData });
            set({ characters: data.characters, myCharacterIds: data.myCharacterIds || [], isLoadingCharacters: false });
        } catch (err) {
            set({ error: (err as Error).message, isLoadingCharacters: false });
        }
    },

    selectCharacter: async (characterId: number, initData: string) => {
        // Reset states and clear messages atomically to prevent flicker
        set({
            _currentCharacterId: characterId,
            messages: [],
            memories: [],
            isSending: false,
            isTyping: false,
            isRegenerating: false,
            selectedCharacter: null,
        } as any);

        // Try to find in cache first
        let character = get().characters.find(c => c.id === characterId) || null;

        // If not in cache, fetch from API
        if (!character) {
            try {
                const data = await apiRequest<{ character: Character }>(`/api/characters/${characterId}`, { initData });
                character = data.character;
            } catch (e) {
                console.error("Failed to fetch character", e);
            }
        }

        set({ selectedCharacter: character });

        try {
            await apiRequest('/api/profile/last-character', {
                method: 'PATCH',
                body: { characterId },
                initData,
            });
        } catch (e) {
            console.error("Failed to save last character", e);
        }

        if (character) {
            await Promise.all([
                get().loadMessages(characterId, initData),
                get().loadMemories(characterId, initData)
            ]);
        }
    },

    loadMessages: async (characterId: number, initData: string) => {
        set({ isLoadingMessages: true, error: null, messages: [], hasMoreMessages: false, nextMessagesCursor: null });
        try {
            const data = await apiRequest<{ messages: DialogMessage[]; hasMore: boolean; nextCursor: string | null }>(`/api/chats/${characterId}/messages`, { initData });
            set({
                messages: data.messages,
                hasMoreMessages: data.hasMore,
                nextMessagesCursor: data.nextCursor,
                isLoadingMessages: false
            });
        } catch (err) {
            set({ error: (err as Error).message, isLoadingMessages: false });
        }
    },

    loadMoreMessages: async (characterId: number, initData: string) => {
        const { nextMessagesCursor, hasMoreMessages, isLoadingMoreMessages } = get();
        if (!hasMoreMessages || isLoadingMoreMessages || !nextMessagesCursor) return;

        set({ isLoadingMoreMessages: true });
        try {
            const data = await apiRequest<{ messages: DialogMessage[]; hasMore: boolean; nextCursor: string | null }>(
                `/api/chats/${characterId}/messages?before=${encodeURIComponent(nextMessagesCursor)}`,
                { initData }
            );
            set(state => ({
                messages: [...data.messages, ...state.messages], // prepend older messages
                hasMoreMessages: data.hasMore,
                nextMessagesCursor: data.nextCursor,
                isLoadingMoreMessages: false
            }));
        } catch (err) {
            set({ error: (err as Error).message, isLoadingMoreMessages: false });
        }
    },

    sendMessage: (characterId: number, text: string, _initData: string) => {
        const processedText = preprocessMessage(text);
        logger.store('chatStore', 'sendMessage', { characterId, text: processedText });
        set({ isSending: true, error: null });

        // Optimistic update - add user message immediately
        const userMessage: DialogMessage = {
            id: Date.now(),
            role: 'user',
            text: processedText,
            createdAt: new Date().toISOString(),
        };

        const state = get();
        const newMessages: DialogMessage[] = [];

        // If this is the first message and character has greeting, add it first
        if (state.messages.length === 0 && state.selectedCharacter?.greetingMessage) {
            newMessages.push({
                id: Date.now() - 1, // Ensure greeting has earlier ID
                role: 'assistant',
                text: state.selectedCharacter.greetingMessage,
                createdAt: new Date().toISOString(),
            });
        }
        newMessages.push(userMessage);

        set(state => ({ messages: [...state.messages, ...newMessages] }));

        // Send via WebSocket
        socketClient.emit('chat:send', { characterId, message: processedText });
    },

    loadMemories: async (characterId: number, initData: string) => {
        set({ isLoadingMemories: true });
        try {
            const data = await apiRequest<{ memories: Memory[] }>(`/api/chats/${characterId}/memories`, { initData });
            set({ memories: data.memories, isLoadingMemories: false });
        } catch (err) {
            console.error(err);
            set({ isLoadingMemories: false });
        }
    },

    addMemory: async (characterId: number, content: string, initData: string) => {
        try {
            const newMem = await apiRequest<Memory>(`/api/chats/${characterId}/memories`, {
                method: 'POST',
                body: { content, importance: 5 },
                initData
            });
            set(state => ({ memories: [newMem, ...state.memories] }));
        } catch (err) {
            set({ error: (err as Error).message });
        }
    },

    deleteMemory: async (characterId: number, memoryId: number, initData: string) => {
        try {
            await apiRequest(`/api/chats/${characterId}/memories/${memoryId}`, {
                method: 'DELETE',
                initData
            });
            set(state => ({ memories: state.memories.filter(m => m.id !== memoryId) }));
        } catch (err) {
            set({ error: (err as Error).message });
        }
    },

    loadLimits: async (initData: string) => {
        try {
            const data = await apiRequest<{
                hasSubscription: boolean;
                messagesLimit: { remaining: number; total: number; resetsAt: string | null } | null;
            }>('/api/limits', { initData });

            if (data.messagesLimit) {
                set({
                    limits: {
                        remaining: data.messagesLimit.remaining,
                        total: data.messagesLimit.total,
                        resetsAt: data.messagesLimit.resetsAt,
                        hasSubscription: data.hasSubscription,
                    }
                });
            } else {
                // Message limits disabled - set unlimited
                set({
                    limits: {
                        remaining: -1,
                        total: -1,
                        resetsAt: null,
                        hasSubscription: data.hasSubscription,
                    }
                });
            }
        } catch (err) {
            console.error('Failed to load limits:', err);
        }
    },

    loadSession: async (characterId: number, initData: string) => {
        try {
            const data = await apiRequest<Session>(`/api/chats/${characterId}/session`, { initData });
            set({ session: data });
        } catch (err) {
            console.error('Failed to load session:', err);
        }
    },

    updateSessionSettings: async (characterId: number, settings: { llmModel: string | null }, initData: string) => {
        try {
            const data = await apiRequest<Session>(`/api/chats/${characterId}/session`, {
                method: 'PATCH',
                body: settings,
                initData
            });
            set({ session: data });
        } catch (err) {
            console.error('Failed to update session:', err);
            set({ error: (err as Error).message });
        }
    },

    forgetRecent: async (characterId: number, count: number, initData: string) => {
        try {
            await apiRequest(`/api/chats/${characterId}/forget-recent`, {
                method: 'POST',
                body: { count },
                initData
            });
            set(state => ({ messages: state.messages.slice(0, -count) }));
        } catch (err) {
            set({ error: (err as Error).message });
        }
    },

    regenerateLastMessage: async (characterId: number, initData: string) => {
        // Remove last assistant message and show typing
        set(state => {
            const messages = [...state.messages];
            // Find and remove last assistant message
            for (let i = messages.length - 1; i >= 0; i--) {
                if (messages[i].role === 'assistant') {
                    messages.splice(i, 1);
                    break;
                }
            }
            return { messages, isRegenerating: true, isTyping: true, error: null };
        });

        try {
            const data = await apiRequest<{
                assistantMessage: { role: 'assistant'; text: string; createdAt: string };
                limits: { remaining: number; total: number; resetsAt: string } | null;
                bonusMessages?: number;
            }>(`/api/chats/${characterId}/regenerate`, {
                method: 'POST',
                initData
            });

            // Add new assistant message
            const newMessage = {
                id: Date.now(),
                role: 'assistant' as const,
                text: data.assistantMessage.text,
                createdAt: data.assistantMessage.createdAt,
            };

            set(state => ({
                messages: [...state.messages, newMessage],
                isRegenerating: false,
                isTyping: false,
                limits: data.limits ? { ...state.limits!, ...data.limits, hasSubscription: state.limits?.hasSubscription ?? false } : state.limits,
            }));

            // Update bonus messages in userStore
            if (data.bonusMessages !== undefined) {
                useUserStore.getState().updateBonusMessages(data.bonusMessages);
            }
        } catch (err) {
            set({ error: (err as Error).message, isRegenerating: false, isTyping: false });
        }
    },

    resetChat: async (characterId: number, initData: string) => {
        try {
            const data = await apiRequest<{
                success: boolean;
                emotionalState: {
                    attraction: number;
                    trust: number;
                    affection: number;
                    dominance: number;
                    closeness: number;
                };
            }>(`/api/chats/${characterId}/reset`, {
                method: 'DELETE',
                initData
            });

            if (data.success) {
                // Clear local state
                set({
                    messages: [],
                    memories: [],
                    session: {
                        emotionalState: data.emotionalState,
                        messagesCount: 0,
                        lastMessageAt: null,
                        createdAt: new Date().toISOString(),
                        llmModel: null,
                    },
                });
                return true;
            }
            return false;
        } catch (err) {
            set({ error: (err as Error).message });
            return false;
        }
    }
}));

