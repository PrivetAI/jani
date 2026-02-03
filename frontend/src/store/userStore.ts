import { create } from 'zustand';
import { apiRequest } from '../lib/api';
import { logger } from '../lib/logger';

export interface Profile {
    id: number;
    telegramUserId: number;
    username: string | null;
    nickname?: string | null;
    conversationStarted: boolean;
    lastCharacterId: number | null;
    subscriptionStatus: 'none' | 'active' | 'expired';
    subscriptionEndAt: string | null;
    isAdmin: boolean;
    displayName?: string;
    gender?: string;
    language?: string;
    voicePerson?: 1 | 3;
    isAdultConfirmed?: boolean;
    bonusMessages?: number;
}

interface UserState {
    profile: Profile | null;
    isLoading: boolean;
    error: string | null;
    initData: string | null;

    setInitData: (initData: string) => void;
    loadProfile: () => Promise<void>;
    updateProfile: (data: Partial<Profile>) => Promise<void>;
    updateBonusMessages: (count: number) => void;
    confirmAdult: () => Promise<void>;
}

export const useUserStore = create<UserState>((set, get) => ({
    profile: null,
    isLoading: false,
    error: null,
    initData: null,

    setInitData: (initData: string) => {
        logger.store('userStore', 'setInitData', { hasData: !!initData });
        set({ initData });
    },

    loadProfile: async () => {
        const { initData } = get();
        if (!initData) return;

        logger.store('userStore', 'loadProfile', 'start');
        set({ isLoading: true, error: null });
        try {
            const data = await apiRequest<{ profile: Profile }>('/api/profile', { initData });
            logger.store('userStore', 'loadProfile', { success: true, userId: data.profile.telegramUserId });
            set({ profile: data.profile, isLoading: false });
        } catch (err) {
            logger.store('userStore', 'loadProfile', { error: (err as Error).message });
            set({ error: (err as Error).message, isLoading: false });
        }
    },

    updateProfile: async (data: Partial<Profile>) => {
        const { initData } = get();
        if (!initData) return;

        set({ isLoading: true });
        try {
            // Assuming standard PATCH endpoint for profile updates
            // Note: The specific endpoint might need adjustment depending on backend implementation
            // Current usage in legacy App.tsx suggests /api/profile/last-character for partial updates
            // but we want a general update.
            // Based on ARCHITECTURE_CHANGES.md: PATCH /api/users/profile

            const response = await apiRequest<{ profile: Profile }>('/api/profile', {
                method: 'PATCH',
                body: data,
                initData,
            });

            set({ profile: response.profile, isLoading: false });
        } catch (err) {
            set({ error: (err as Error).message, isLoading: false });
        }
    },

    updateBonusMessages: (count: number) => {
        const { profile } = get();
        if (profile) {
            set({ profile: { ...profile, bonusMessages: count } });
        }
    },

    confirmAdult: async () => {
        const { initData, profile } = get();
        if (!initData) return;

        try {
            await apiRequest('/api/confirm-adult', {
                method: 'POST',
                body: { confirmed: true },
                initData
            });
            set({ profile: profile ? { ...profile, isAdultConfirmed: true } : null });
        } catch (err) {
            set({ error: (err as Error).message });
        }
    }
}));
