import { useEffect, useState } from 'react';
import { useUserStore } from '../store/userStore';
import { apiRequest } from '../lib/api';
import type { Character, LLMModel } from '../components/admin/types';
import { CharacterEditForm } from '../components/admin/CharacterEditForm';
import { CharacterListItem } from '../components/admin/CharacterListItem';

interface GlobalSettings {
    summary_provider: string;
    summary_model: string;
}

interface Tag {
    id: number;
    name: string;
}

export function AdminPage() {
    const { profile, initData } = useUserStore();
    const [stats, setStats] = useState<any>(null);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [commonPrompt, setCommonPrompt] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<Partial<Character>>({});
    const [providerModels, setProviderModels] = useState<Record<string, LLMModel[]>>({});
    const [loadingModels, setLoadingModels] = useState(false);
    const [validationError, setValidationError] = useState<string | null>(null);
    const [availableTags, setAvailableTags] = useState<Tag[]>([]);

    // Global settings
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({ summary_provider: 'openrouter', summary_model: '' });
    const [savingSettings, setSavingSettings] = useState(false);
    const [summaryModelSearch, setSummaryModelSearch] = useState('');
    const [isSummaryModelOpen, setIsSummaryModelOpen] = useState(false);

    useEffect(() => {
        if (initData && profile?.isAdmin) {
            apiRequest('/api/admin/stats', { initData })
                .then((data: any) => setStats(data.stats))
                .catch(console.error);
            apiRequest('/api/admin/characters', { initData })
                .then((data: any) => setCharacters(data.characters))
                .catch(console.error);
            apiRequest('/api/admin/system-prompt', { initData })
                .then((data: any) => setCommonPrompt(data.commonSystemPrompt))
                .catch(console.error);
            apiRequest('/api/admin/settings', { initData })
                .then((data: any) => setGlobalSettings(data.settings))
                .catch(console.error);
            apiRequest('/api/tags', { initData })
                .then((data: any) => setAvailableTags(data.tags))
                .catch(console.error);
        }
    }, [initData, profile]);

    // Fetch models when provider changes
    useEffect(() => {
        const provider = editForm.llmProvider;
        if (!provider || !initData || providerModels[provider]) return;

        const endpoints: Record<string, string> = {
            gemini: '/api/admin/gemini-models',
            openai: '/api/admin/openai-models',
            openrouter: '/api/admin/openrouter-models',
        };

        const endpoint = endpoints[provider];
        if (!endpoint) return;

        setLoadingModels(true);
        apiRequest(endpoint, { initData })
            .then((data: any) => {
                setProviderModels(prev => ({ ...prev, [provider]: data.models || [] }));
            })
            .catch(console.error)
            .finally(() => setLoadingModels(false));
    }, [editForm.llmProvider, initData, providerModels]);

    const startEdit = (char: Character) => {
        setEditingId(char.id);
        setEditForm(char);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({});
        setValidationError(null);
    };

    const saveEdit = async () => {
        if (!editingId || !initData) return;

        // Validation
        if (!editForm.llmProvider) {
            setValidationError('Выберите провайдера');
            return;
        }
        if (!editForm.llmModel) {
            setValidationError('Выберите модель');
            return;
        }
        setValidationError(null);
        try {
            await apiRequest(`/api/admin/characters/${editingId}`, {
                method: 'PUT',
                body: {
                    name: editForm.name,
                    description_long: editForm.description,
                    system_prompt: editForm.systemPrompt,
                    access_type: editForm.accessType,
                    is_active: editForm.isActive,
                    avatar_url: editForm.avatarUrl || null,
                    genre: editForm.genre || null,
                    content_rating: editForm.contentRating || null,
                    grammatical_gender: editForm.grammaticalGender || 'female',
                    initial_attraction: editForm.initialAttraction ?? 0,
                    initial_trust: editForm.initialTrust ?? 10,
                    initial_affection: editForm.initialAffection ?? 5,
                    initial_dominance: editForm.initialDominance ?? 0,
                    llm_provider: editForm.llmProvider || null,
                    llm_model: editForm.llmModel || null,
                    llm_temperature: editForm.llmTemperature ?? null,
                    llm_top_p: editForm.llmTopP ?? null,
                    llm_repetition_penalty: editForm.llmRepetitionPenalty ?? null,
                    tag_ids: editForm.tagIds || [],
                },
                initData,
            });
            setCharacters(chars => chars.map(c => c.id === editingId ? { ...c, ...editForm } as Character : c));
            cancelEdit();
        } catch (err) {
            alert('Ошибка сохранения');
        }
    };

    if (!profile?.isAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-danger">Доступ запрещен</div>
            </div>
        );
    }

    const currentModels = editForm.llmProvider ? providerModels[editForm.llmProvider] || [] : [];

    return (
        <div className="min-h-screen p-4 pb-20">
            <div className="max-w-4xl mx-auto">
                <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    Админ-панель
                </h2>

                {/* Stats */}
                {stats && (
                    <div className="flex gap-4 mb-6">
                        <div className="flex-1 p-4 rounded-xl bg-surface-light border border-border">
                            <div className="text-2xl font-bold text-text-primary">{stats.totalUsers}</div>
                            <div className="text-sm text-text-muted">Пользователей</div>
                        </div>
                        <div className="flex-1 p-4 rounded-xl bg-surface-light border border-border">
                            <div className="text-2xl font-bold text-text-primary">{stats.messagesCount}</div>
                            <div className="text-sm text-text-muted">Сообщений</div>
                        </div>
                    </div>
                )}

                {/* Global Summary Settings */}
                <div className="mb-6 p-4 rounded-xl bg-surface-light border border-border">
                    <h3 className="text-sm font-semibold mb-3 text-text-secondary">⚙️ Настройки саммаризации</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-text-muted mb-1">Провайдер</label>
                            <select
                                value={globalSettings.summary_provider || 'openrouter'}
                                onChange={e => setGlobalSettings(prev => ({ ...prev, summary_provider: e.target.value }))}
                                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-primary text-sm"
                            >
                                <option value="openrouter">OpenRouter</option>
                                <option value="gemini">Gemini</option>
                                <option value="openai">OpenAI</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-text-muted mb-1">Модель</label>
                            <div className="flex gap-2">
                                <div className="relative flex-1">
                                    <input
                                        type="text"
                                        value={isSummaryModelOpen ? summaryModelSearch : (
                                            (providerModels[globalSettings.summary_provider] || []).find(m => m.id === globalSettings.summary_model)?.name ||
                                            globalSettings.summary_model || ''
                                        )}
                                        onChange={e => {
                                            setSummaryModelSearch(e.target.value);
                                            if (!isSummaryModelOpen) setIsSummaryModelOpen(true);
                                        }}
                                        onFocus={() => setIsSummaryModelOpen(true)}
                                        onBlur={() => setTimeout(() => setIsSummaryModelOpen(false), 150)}
                                        placeholder="Поиск модели..."
                                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-primary text-sm"
                                    />
                                    {isSummaryModelOpen && (providerModels[globalSettings.summary_provider] || []).length > 0 && (
                                        <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-lg bg-slate-900 border border-border shadow-lg">
                                            <button
                                                type="button"
                                                onMouseDown={() => {
                                                    setGlobalSettings(prev => ({ ...prev, summary_model: '' }));
                                                    setSummaryModelSearch('');
                                                    setIsSummaryModelOpen(false);
                                                }}
                                                className={`w-full px-3 py-2 text-left text-sm hover:bg-primary/20 ${!globalSettings.summary_model ? 'bg-primary/10 text-primary' : 'text-text-primary'
                                                    }`}
                                            >
                                                Авто
                                            </button>
                                            {(providerModels[globalSettings.summary_provider] || [])
                                                .filter(m => m.name.toLowerCase().includes(summaryModelSearch.toLowerCase()) || m.id.toLowerCase().includes(summaryModelSearch.toLowerCase()))
                                                .map(m => (
                                                    <button
                                                        key={m.id}
                                                        type="button"
                                                        onMouseDown={() => {
                                                            setGlobalSettings(prev => ({ ...prev, summary_model: m.id }));
                                                            setSummaryModelSearch('');
                                                            setIsSummaryModelOpen(false);
                                                        }}
                                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-primary/20 ${globalSettings.summary_model === m.id ? 'bg-primary/10 text-primary' : 'text-text-primary'
                                                            }`}
                                                    >
                                                        {m.name}
                                                    </button>
                                                ))}
                                        </div>
                                    )}
                                </div>
                                <button
                                    onClick={async () => {
                                        if (!initData) return;
                                        const endpoints: Record<string, string> = {
                                            gemini: '/api/admin/gemini-models',
                                            openai: '/api/admin/openai-models',
                                            openrouter: '/api/admin/openrouter-models',
                                        };
                                        const endpoint = endpoints[globalSettings.summary_provider];
                                        if (endpoint) {
                                            const data = await apiRequest(endpoint, { initData }) as any;
                                            setProviderModels(prev => ({ ...prev, [globalSettings.summary_provider]: data.models || [] }));
                                        }
                                    }}
                                    className="px-3 py-2 rounded-lg bg-surface border border-border text-text-secondary text-sm hover:bg-primary/20"
                                >
                                    🔄
                                </button>
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={async () => {
                            if (!initData) return;
                            setSavingSettings(true);
                            try {
                                await apiRequest('/api/admin/settings', {
                                    method: 'PUT',
                                    body: globalSettings,
                                    initData,
                                });
                            } catch (err) {
                                console.error(err);
                            } finally {
                                setSavingSettings(false);
                            }
                        }}
                        disabled={savingSettings}
                        className="mt-3 px-4 py-2 rounded-lg bg-gradient-to-r from-primary to-indigo-500 text-white text-sm font-medium disabled:opacity-50"
                    >
                        {savingSettings ? 'Сохранение...' : 'Сохранить настройки'}
                    </button>
                </div>

                {/* System Prompt */}
                <div className="mb-6">
                    <h3 className="text-sm font-semibold mb-2 text-text-secondary">Общий системный промпт</h3>
                    <pre className="p-3 rounded-lg bg-slate-900/80 border border-border text-primary text-xs font-mono whitespace-pre-wrap">
                        {commonPrompt}
                    </pre>
                </div>

                {/* Characters */}
                <h3 className="text-sm font-semibold mb-3 text-text-secondary">Персонажи ({characters.length})</h3>
                <div className="space-y-3">
                    {characters.map(char => (
                        <div key={char.id} className="p-4 rounded-xl bg-surface-light border border-border">
                            {editingId === char.id ? (
                                <CharacterEditForm
                                    editForm={editForm}
                                    setEditForm={setEditForm}
                                    models={currentModels}
                                    loadingModels={loadingModels}
                                    onSave={saveEdit}
                                    onCancel={cancelEdit}
                                    validationError={validationError}
                                    availableTags={availableTags}
                                />
                            ) : (
                                <CharacterListItem
                                    character={char}
                                    onEdit={startEdit}
                                />
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

