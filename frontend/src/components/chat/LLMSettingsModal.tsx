import { useState, useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useUserStore } from '../../store/userStore';
import { apiRequest } from '../../lib/api';

interface AllowedModel {
    id: number;
    modelId: string;
    displayName: string;
    provider: string;
    isDefault: boolean;
}

interface LLMSettings {
    model: string | null;
    temperature: number | null;
    topP: number | null;
}

interface LLMSettingsModalProps {
    onClose: () => void;
}

export function LLMSettingsModal({ onClose }: LLMSettingsModalProps) {
    const { selectedCharacter, loadSession } = useChatStore();
    const { initData, profile } = useUserStore();

    const isPremium = profile?.subscriptionStatus === 'active';

    const [models, setModels] = useState<AllowedModel[]>([]);
    const [settings, setSettings] = useState<LLMSettings>({
        model: null,
        temperature: null,
        topP: null,
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    // Load allowed models and current settings
    useEffect(() => {
        if (!initData || !selectedCharacter) return;

        const load = async () => {
            try {
                const [modelsData, settingsData] = await Promise.all([
                    apiRequest<{ models: AllowedModel[] }>('/api/allowed-models', { initData }),
                    apiRequest<LLMSettings>(`/api/chats/${selectedCharacter.id}/llm-settings`, { initData }),
                ]);
                setModels(modelsData.models);
                setSettings(settingsData);
            } catch (err) {
                console.error('Failed to load LLM settings', err);
            } finally {
                setIsLoading(false);
            }
        };

        load();
    }, [initData, selectedCharacter]);

    const handleSave = async () => {
        if (!initData || !selectedCharacter || !isPremium) return;

        setIsSaving(true);
        try {
            await apiRequest(`/api/chats/${selectedCharacter.id}/llm-settings`, {
                method: 'PATCH',
                body: settings,
                initData,
            });
            // Reload session to update UI
            await loadSession(selectedCharacter.id, initData);
            onClose();
        } catch (err) {
            console.error('Failed to save LLM settings', err);
        } finally {
            setIsSaving(false);
        }
    };

    const handleReset = () => {
        if (!isPremium) return;
        setSettings({ model: null, temperature: null, topP: null });
    };

    if (isLoading) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                <div className="w-full max-w-md p-6 rounded-2xl bg-surface/95 border border-border">
                    <p className="text-text-muted text-center animate-pulse">Загрузка...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-surface/95 border border-border overflow-hidden">
                {/* Header */}
                <header className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-lg">⚙️ Настройки LLM</h3>
                        {!isPremium && (
                            <span className="text-xs text-primary px-2 py-1 bg-primary/10 rounded-lg">Premium</span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-lg text-sm bg-surface-light border border-border text-text-secondary
                            hover:bg-surface hover:text-text-primary transition-colors"
                    >
                        Закрыть
                    </button>
                </header>

                {/* Content */}
                <div className={`p-5 space-y-5 ${!isPremium ? 'opacity-60' : ''}`}>
                    {!isPremium && (
                        <p className="text-xs text-primary bg-primary/10 px-3 py-2 rounded-lg">
                            🔒 Настройка параметров LLM доступна только с Premium-подпиской
                        </p>
                    )}

                    {/* Model Select */}
                    <div className="space-y-2">
                        <label className="text-sm text-text-secondary">Модель</label>
                        <select
                            value={settings.model || ''}
                            onChange={(e) => setSettings(s => ({ ...s, model: e.target.value || null }))}
                            disabled={!isPremium}
                            className="w-full px-3 py-2.5 rounded-xl bg-surface-light border border-border text-text-primary
                                focus:outline-none focus:border-primary disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <option value="">По умолчанию (персонаж)</option>
                            {models.map(m => (
                                <option key={m.id} value={m.modelId}>
                                    {m.displayName}
                                </option>
                            ))}
                        </select>
                        {models.length === 0 && (
                            <p className="text-xs text-text-muted">Нет доступных моделей</p>
                        )}
                    </div>

                    {/* Temperature Slider */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm text-text-secondary">Температура</label>
                            <label className={`flex items-center gap-2 ${isPremium ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                                <input
                                    type="checkbox"
                                    checked={settings.temperature == null}
                                    onChange={(e) => setSettings(s => ({
                                        ...s,
                                        temperature: e.target.checked ? null : 0.7
                                    }))}
                                    disabled={!isPremium}
                                    className="w-4 h-4 rounded accent-primary cursor-pointer disabled:cursor-not-allowed"
                                />
                                <span className="text-sm text-text-muted">Авто</span>
                            </label>
                        </div>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min="0"
                                max="2"
                                step="0.1"
                                value={settings.temperature ?? 0.7}
                                disabled={settings.temperature == null || !isPremium}
                                onChange={(e) => setSettings(s => ({ ...s, temperature: parseFloat(e.target.value) }))}
                                className="flex-1 h-2 rounded-full appearance-none bg-surface-light
                                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
                                    [&::-webkit-slider-thumb]:cursor-pointer
                                    disabled:opacity-50 disabled:[&::-webkit-slider-thumb]:bg-text-muted"
                            />
                            <span className="text-sm text-text-muted w-10 text-right">
                                {settings.temperature != null ? settings.temperature.toFixed(1) : '—'}
                            </span>
                        </div>
                        <p className="text-xs text-text-muted">
                            Низкая = точные ответы, высокая = креативные ответы
                        </p>
                    </div>

                    {/* Top-P Slider */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="text-sm text-text-secondary">Top-P</label>
                            <label className={`flex items-center gap-2 ${isPremium ? 'cursor-pointer' : 'cursor-not-allowed'}`}>
                                <input
                                    type="checkbox"
                                    checked={settings.topP == null}
                                    onChange={(e) => setSettings(s => ({
                                        ...s,
                                        topP: e.target.checked ? null : 0.9
                                    }))}
                                    disabled={!isPremium}
                                    className="w-4 h-4 rounded accent-primary cursor-pointer disabled:cursor-not-allowed"
                                />
                                <span className="text-sm text-text-muted">Авто</span>
                            </label>
                        </div>
                        <div className="flex items-center gap-3">
                            <input
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={settings.topP ?? 0.9}
                                disabled={settings.topP == null || !isPremium}
                                onChange={(e) => setSettings(s => ({ ...s, topP: parseFloat(e.target.value) }))}
                                className="flex-1 h-2 rounded-full appearance-none bg-surface-light
                                    [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4
                                    [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary
                                    [&::-webkit-slider-thumb]:cursor-pointer
                                    disabled:opacity-50 disabled:[&::-webkit-slider-thumb]:bg-text-muted"
                            />
                            <span className="text-sm text-text-muted w-12 text-right">
                                {settings.topP != null ? settings.topP.toFixed(2) : '—'}
                            </span>
                        </div>
                        <p className="text-xs text-text-muted">
                            Nucleus sampling - ограничивает выбор токенов
                        </p>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-2">
                        <button
                            onClick={handleReset}
                            disabled={!isPremium}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-surface-light border border-border
                                text-text-secondary hover:text-text-primary transition-colors
                                disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Сбросить
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isSaving || !isPremium}
                            className="flex-1 px-4 py-2.5 rounded-xl bg-primary text-white font-medium
                                hover:bg-primary/90 disabled:opacity-50 transition-colors disabled:cursor-not-allowed"
                        >
                            {isSaving ? 'Сохранение...' : 'Сохранить'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
