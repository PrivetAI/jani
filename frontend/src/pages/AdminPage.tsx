import { useEffect, useState, useMemo } from 'react';
import { useUserStore } from '../store/userStore';
import { apiRequest } from '../lib/api';
import type { Character, LLMModel } from '../components/admin/types';
import { CharacterEditForm } from '../components/admin/CharacterEditForm';
import { CharacterListItem } from '../components/admin/CharacterListItem';
import { useDebounce } from '../hooks/useDebounce';

interface GlobalSettings {
    summary_provider: string;
    summary_model: string;
}

interface Tag {
    id: number;
    name: string;
}

interface UploadedFile {
    filename: string;
    url: string;
    size: number;
    createdAt: string;
}

interface AllowedModel {
    id: number;
    provider: string;
    modelId: string;
    displayName: string;
    isDefault: boolean;
    isFallback: boolean;
    isRecommended: boolean;
    isActive: boolean;
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
    const [isCreating, setIsCreating] = useState(false);

    // Global settings
    const [globalSettings, setGlobalSettings] = useState<GlobalSettings>({ summary_provider: 'openrouter', summary_model: '' });
    const [savingSettings, setSavingSettings] = useState(false);
    const [summaryModelSearch, setSummaryModelSearch] = useState('');
    const [isSummaryModelOpen, setIsSummaryModelOpen] = useState(false);

    // Uploads management
    const [uploads, setUploads] = useState<UploadedFile[]>([]);
    const [usedUploads, setUsedUploads] = useState<string[]>([]);
    const [deletingUnused, setDeletingUnused] = useState(false);

    // Tag management
    const [newTagName, setNewTagName] = useState('');
    const [creatingTag, setCreatingTag] = useState(false);
    const [deletingTagId, setDeletingTagId] = useState<number | null>(null);

    // Allowed Models management
    const [allowedModels, setAllowedModels] = useState<AllowedModel[]>([]);
    const [newModel, setNewModel] = useState({ provider: 'gemini', modelId: '', displayName: '' });
    const [addingModel, setAddingModel] = useState(false);
    const [allowedModelSearch, setAllowedModelSearch] = useState('');
    const [isAllowedModelDropdownOpen, setIsAllowedModelDropdownOpen] = useState(false);

    // UGC Moderation
    interface PendingCharacter {
        id: number;
        name: string;
        description: string;
        systemPrompt: string;
        avatarUrl?: string;
        createdBy: { id: number; name: string };
        createdAt: string;
    }
    interface RejectedCharacter extends PendingCharacter {
        rejectionReason: string;
    }
    const [pendingCharacters, setPendingCharacters] = useState<PendingCharacter[]>([]);
    const [rejectedCharacters, setRejectedCharacters] = useState<RejectedCharacter[]>([]);
    const [expandedPending, setExpandedPending] = useState<number | null>(null);
    const [expandedRejected, setExpandedRejected] = useState<number | null>(null);
    const [moderating, setModerating] = useState<number | null>(null);
    // Rejection modal state
    const [rejectModalCharId, setRejectModalCharId] = useState<number | null>(null);
    const [rejectionReason, setRejectionReason] = useState('');

    // Character search
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearch = useDebounce(searchQuery, 300);

    // Filtered characters
    const filteredCharacters = useMemo(() => {
        if (!debouncedSearch.trim()) return characters;
        const query = debouncedSearch.toLowerCase();
        return characters.filter(char =>
            char.name.toLowerCase().includes(query) ||
            char.description?.toLowerCase().includes(query) ||
            char.createdBy?.name?.toLowerCase().includes(query)
        );
    }, [characters, debouncedSearch]);

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
            apiRequest('/api/admin/tags', { initData })
                .then((data: any) => setAvailableTags(data.tags))
                .catch(console.error);
            apiRequest('/api/admin/uploads', { initData })
                .then((data: any) => {
                    setUploads(data.files || []);
                    setUsedUploads(data.usedFiles || []);
                })
                .catch(console.error);
            // Load pending UGC characters
            apiRequest('/api/admin/characters/pending', { initData })
                .then((data: any) => setPendingCharacters(data.characters || []))
                .catch(console.error);
            // Load rejected UGC characters
            apiRequest('/api/admin/characters/rejected', { initData })
                .then((data: any) => setRejectedCharacters(data.characters || []))
                .catch(console.error);
            // Load allowed models
            apiRequest('/api/admin/allowed-models', { initData })
                .then((data: any) => setAllowedModels(data.models || []))
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
        setIsCreating(false);
        setEditForm({});
        setValidationError(null);
    };

    const startCreate = () => {
        setIsCreating(true);
        setEditingId(null);
        setEditForm({
            name: '',
            description: '',
            systemPrompt: '',
            accessType: 'free',
            isActive: true,
            grammaticalGender: 'female',
            initialAttraction: 0,
            initialTrust: 10,
            initialAffection: 5,
            initialDominance: 0,
        });
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

    const createCharacter = async () => {
        if (!initData) return;

        // Validation
        if (!editForm.llmProvider) {
            setValidationError('Выберите провайдера');
            return;
        }
        if (!editForm.llmModel) {
            setValidationError('Выберите модель');
            return;
        }
        if (!editForm.name) {
            setValidationError('Введите имя персонажа');
            return;
        }
        if (!editForm.description) {
            setValidationError('Введите описание');
            return;
        }
        if (!editForm.systemPrompt) {
            setValidationError('Введите системный промпт');
            return;
        }
        setValidationError(null);

        try {
            await apiRequest<{ character: { id: number } }>('/api/admin/characters', {
                method: 'POST',
                body: {
                    name: editForm.name,
                    description_long: editForm.description,
                    system_prompt: editForm.systemPrompt,
                    access_type: editForm.accessType,
                    is_active: editForm.isActive,
                    avatar_url: editForm.avatarUrl || null,
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

            // Reload characters to get the new one with all fields
            const data = await apiRequest<{ characters: Character[] }>('/api/admin/characters', { initData });
            setCharacters(data.characters);
            cancelEdit();
        } catch (err) {
            alert('Ошибка создания');
        }
    };

    const deleteUnusedUploads = async () => {
        if (!initData) return;
        setDeletingUnused(true);
        try {
            const result = await apiRequest<{ deleted: string[] }>('/api/admin/uploads/unused', {
                method: 'DELETE',
                initData,
            });
            setUploads(prev => prev.filter(f => !result.deleted.includes(f.filename)));
            alert(`Удалено файлов: ${result.deleted.length}`);
        } catch (err) {
            alert('Ошибка удаления');
        } finally {
            setDeletingUnused(false);
        }
    };

    const createNewTag = async () => {
        if (!initData || !newTagName.trim()) return;
        setCreatingTag(true);
        try {
            const result = await apiRequest<{ tag: Tag }>('/api/admin/tags', {
                method: 'POST',
                body: { name: newTagName.trim() },
                initData,
            });
            setAvailableTags(prev => [...prev, result.tag]);
            setNewTagName('');
        } catch (err) {
            alert('Ошибка создания тега');
        } finally {
            setCreatingTag(false);
        }
    };

    const deleteTagById = async (id: number) => {
        if (!initData) return;
        setDeletingTagId(id);
        try {
            await apiRequest(`/api/admin/tags/${id}`, {
                method: 'DELETE',
                initData,
            });
            setAvailableTags(prev => prev.filter(t => t.id !== id));
        } catch (err) {
            alert('Ошибка удаления тега');
        } finally {
            setDeletingTagId(null);
        }
    };

    const approveCharacter = async (id: number) => {
        if (!initData) return;
        setModerating(id);
        try {
            await apiRequest(`/api/admin/characters/${id}/approve`, { method: 'PATCH', initData });
            setPendingCharacters(prev => prev.filter(c => c.id !== id));
            // Reload main characters list
            const data = await apiRequest<{ characters: Character[] }>('/api/admin/characters', { initData });
            setCharacters(data.characters);
        } catch (err) {
            alert('Ошибка одобрения');
        } finally {
            setModerating(null);
        }
    };

    // Open rejection modal
    const rejectCharacter = (id: number) => {
        setRejectModalCharId(id);
        setRejectionReason('');
    };

    // Confirm rejection with reason
    const confirmRejectCharacter = async () => {
        if (!initData || !rejectModalCharId || !rejectionReason.trim()) return;
        setModerating(rejectModalCharId);
        try {
            await apiRequest(`/api/admin/characters/${rejectModalCharId}/reject`, {
                method: 'PATCH',
                body: { reason: rejectionReason.trim() },
                initData,
            });
            // Move from pending to rejected
            const rejected = pendingCharacters.find(c => c.id === rejectModalCharId);
            setPendingCharacters(prev => prev.filter(c => c.id !== rejectModalCharId));
            if (rejected) {
                setRejectedCharacters(prev => [{ ...rejected, rejectionReason: rejectionReason.trim() }, ...prev]);
            }
            setRejectModalCharId(null);
            setRejectionReason('');
        } catch (err) {
            alert('Ошибка отклонения');
        } finally {
            setModerating(null);
        }
    };

    const cancelReject = () => {
        setRejectModalCharId(null);
        setRejectionReason('');
    };

    const deleteCharacterById = async (char: Character) => {
        console.log('deleteCharacterById called', char.id, char.name);
        if (!initData) {
            console.log('deleteCharacterById: no initData');
            return;
        }
        if (!confirm(`Удалить персонажа "${char.name}"? Это действие нельзя отменить.`)) {
            console.log('deleteCharacterById: cancelled by user');
            return;
        }
        try {
            console.log('deleteCharacterById: sending DELETE request');
            await apiRequest(`/api/admin/characters/${char.id}`, { method: 'DELETE', initData });
            console.log('deleteCharacterById: success');
            setCharacters(prev => prev.filter(c => c.id !== char.id));
        } catch (err) {
            console.error('deleteCharacterById: error', err);
            alert('Ошибка удаления');
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
        <div className="min-h-screen p-4 pb-20" style={{ overscrollBehavior: 'contain' }}>
            <div className="max-w-4xl mx-auto">
                <h2 className="text-2xl font-bold mb-6 bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    Админ-панель
                </h2>

                {/* Stats */}
                {stats && (
                    <div className="flex gap-4 mb-6 flex-wrap">
                        <div className="flex-1 min-w-[120px] p-4 rounded-xl bg-surface-light border border-border">
                            <div className="text-2xl font-bold text-text-primary">{stats.totalUsers}</div>
                            <div className="text-sm text-text-muted">Пользователей</div>
                            {stats.newUsersToday > 0 && (
                                <div className="text-xs text-success mt-1">+{stats.newUsersToday} за 24ч</div>
                            )}
                        </div>
                        <div className="flex-1 min-w-[120px] p-4 rounded-xl bg-surface-light border border-border">
                            <div className="text-2xl font-bold text-text-primary">{stats.totalMessages}</div>
                            <div className="text-sm text-text-muted">Сообщений всего</div>
                            {stats.messagesCount > 0 && (
                                <div className="text-xs text-success mt-1">+{stats.messagesCount} за 24ч</div>
                            )}
                        </div>
                        <div className="flex-1 min-w-[120px] p-4 rounded-xl bg-surface-light border border-border">
                            <div className="text-2xl font-bold text-text-primary">{stats.totalReferrals ?? 0}</div>
                            <div className="text-sm text-text-muted">Рефералов</div>
                        </div>
                        <div className="flex-1 min-w-[120px] p-4 rounded-xl bg-surface-light border border-border">
                            <div className="text-2xl font-bold text-text-primary">{stats.referralIndex ?? 0}%</div>
                            <div className="text-sm text-text-muted">Реф. индекс</div>
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
                                                className={`w-full px-3 py-2 text-left text-sm hover:bg-primary/20 cursor-pointer ${!globalSettings.summary_model ? 'bg-primary/10 text-primary' : 'text-text-primary'
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
                                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-primary/20 cursor-pointer ${globalSettings.summary_model === m.id ? 'bg-primary/10 text-primary' : 'text-text-primary'
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
                                    className="px-3 py-2 rounded-lg bg-surface border border-border text-text-secondary text-sm hover:bg-primary/20 cursor-pointer"
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
                        className="mt-3 px-4 py-2 rounded-lg bg-gradient-to-r from-primary to-indigo-500 text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
                    >
                        {savingSettings ? 'Сохранение...' : 'Сохранить настройки'}
                    </button>
                </div>

                {/* Tag Management */}
                <div className="mb-6 p-4 rounded-xl bg-surface-light border border-border">
                    <h3 className="text-sm font-semibold mb-3 text-text-secondary">🏷️ Управление тегами ({availableTags.length})</h3>

                    {/* Create new tag */}
                    <div className="flex gap-2 mb-4">
                        <input
                            type="text"
                            value={newTagName}
                            onChange={e => setNewTagName(e.target.value)}
                            placeholder="Название тега..."
                            className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border text-text-primary text-sm"
                        />
                        <button
                            onClick={createNewTag}
                            disabled={creatingTag || !newTagName.trim()}
                            className="px-4 py-2 rounded-lg bg-gradient-to-r from-primary to-indigo-500 text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
                        >
                            {creatingTag ? '...' : '+ Добавить'}
                        </button>
                    </div>

                    {/* Tags list */}
                    <div className="flex flex-wrap gap-2">
                        {availableTags.map(tag => (
                            <div
                                key={tag.id}
                                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border"
                            >
                                <span className="text-sm text-text-primary">{tag.name}</span>
                                <button
                                    onClick={() => deleteTagById(tag.id)}
                                    disabled={deletingTagId === tag.id}
                                    className="text-danger hover:text-danger/80 text-sm disabled:opacity-50 cursor-pointer"
                                    title="Удалить тег"
                                >
                                    {deletingTagId === tag.id ? '...' : '×'}
                                </button>
                            </div>
                        ))}
                        {availableTags.length === 0 && (
                            <p className="text-text-muted text-sm">Нет тегов</p>
                        )}
                    </div>
                </div>

                {/* Allowed Models Management */}
                <div className="mb-6 p-4 rounded-xl bg-surface-light border border-border">
                    <h3 className="text-sm font-semibold mb-3 text-text-secondary">🤖 Разрешённые модели для пользователей ({allowedModels.length})</h3>

                    {/* Add new model */}
                    <div className="flex gap-2 mb-4 flex-wrap items-end">
                        <div>
                            <label className="block text-xs text-text-muted mb-1">Провайдер</label>
                            <select
                                value={newModel.provider}
                                onChange={e => {
                                    setNewModel(prev => ({ ...prev, provider: e.target.value, modelId: '', displayName: '' }));
                                    setAllowedModelSearch('');
                                }}
                                className="px-3 py-2 rounded-lg bg-surface border border-border text-text-primary text-sm"
                            >
                                <option value="gemini">Gemini</option>
                                <option value="openrouter">OpenRouter</option>
                                <option value="openai">OpenAI</option>
                            </select>
                        </div>
                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-xs text-text-muted mb-1">Модель</label>
                            <div className="relative">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={isAllowedModelDropdownOpen ? allowedModelSearch : (
                                            (providerModels[newModel.provider] || []).find(m => m.id === newModel.modelId)?.name ||
                                            newModel.modelId || ''
                                        )}
                                        onChange={e => {
                                            setAllowedModelSearch(e.target.value);
                                            if (!isAllowedModelDropdownOpen) setIsAllowedModelDropdownOpen(true);
                                        }}
                                        onFocus={() => setIsAllowedModelDropdownOpen(true)}
                                        onBlur={() => setTimeout(() => setIsAllowedModelDropdownOpen(false), 150)}
                                        placeholder="Поиск модели..."
                                        className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border text-text-primary text-sm"
                                    />
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (!initData) return;
                                            const endpoints: Record<string, string> = {
                                                gemini: '/api/admin/gemini-models',
                                                openai: '/api/admin/openai-models',
                                                openrouter: '/api/admin/openrouter-models',
                                            };
                                            const endpoint = endpoints[newModel.provider];
                                            if (endpoint) {
                                                setLoadingModels(true);
                                                try {
                                                    const data = await apiRequest(endpoint, { initData }) as any;
                                                    setProviderModels(prev => ({ ...prev, [newModel.provider]: data.models || [] }));
                                                } finally {
                                                    setLoadingModels(false);
                                                }
                                            }
                                        }}
                                        className="px-3 py-2 rounded-lg bg-surface border border-border text-text-secondary text-sm hover:bg-primary/20 cursor-pointer"
                                    >
                                        {loadingModels ? '...' : '🔄'}
                                    </button>
                                </div>
                                {isAllowedModelDropdownOpen && (providerModels[newModel.provider] || []).length > 0 && (
                                    <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-lg bg-slate-900 border border-border shadow-lg">
                                        {(providerModels[newModel.provider] || [])
                                            .filter(m => m.name.toLowerCase().includes(allowedModelSearch.toLowerCase()) || m.id.toLowerCase().includes(allowedModelSearch.toLowerCase()))
                                            .slice(0, 50)
                                            .map(m => (
                                                <button
                                                    key={m.id}
                                                    type="button"
                                                    onMouseDown={() => {
                                                        setNewModel(prev => ({ ...prev, modelId: m.id, displayName: m.name }));
                                                        setAllowedModelSearch('');
                                                        setIsAllowedModelDropdownOpen(false);
                                                    }}
                                                    className={`w-full px-3 py-2 text-left text-sm hover:bg-primary/20 cursor-pointer ${newModel.modelId === m.id ? 'bg-primary/10 text-primary' : 'text-text-primary'
                                                        }`}
                                                >
                                                    {m.name}
                                                </button>
                                            ))}
                                    </div>
                                )}
                                {isAllowedModelDropdownOpen && (providerModels[newModel.provider] || []).length === 0 && (
                                    <div className="absolute z-50 w-full mt-1 p-3 rounded-lg bg-slate-900 border border-border shadow-lg text-text-muted text-sm">
                                        Нажмите 🔄 чтобы загрузить список моделей
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="flex-1 min-w-[150px]">
                            <label className="block text-xs text-text-muted mb-1">Название для UI</label>
                            <input
                                type="text"
                                value={newModel.displayName}
                                onChange={e => setNewModel(prev => ({ ...prev, displayName: e.target.value }))}
                                placeholder="Название..."
                                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-primary text-sm"
                            />
                        </div>
                        <button
                            onClick={async () => {
                                if (!initData || !newModel.modelId.trim() || !newModel.displayName.trim()) return;
                                setAddingModel(true);
                                try {
                                    const result = await apiRequest<{ id: number }>('/api/admin/allowed-models', {
                                        method: 'POST',
                                        body: {
                                            provider: newModel.provider,
                                            model_id: newModel.modelId.trim(),
                                            display_name: newModel.displayName.trim(),
                                        },
                                        initData,
                                    });
                                    setAllowedModels(prev => [...prev, {
                                        id: result.id,
                                        provider: newModel.provider,
                                        modelId: newModel.modelId.trim(),
                                        displayName: newModel.displayName.trim(),
                                        isDefault: false,
                                        isFallback: false,
                                        isRecommended: false,
                                        isActive: true,
                                    }]);
                                    setNewModel({ provider: 'gemini', modelId: '', displayName: '' });
                                } catch (err) {
                                    alert('Ошибка добавления модели');
                                } finally {
                                    setAddingModel(false);
                                }
                            }}
                            disabled={addingModel || !newModel.modelId.trim() || !newModel.displayName.trim()}
                            className="px-4 py-2 rounded-lg bg-gradient-to-r from-primary to-indigo-500 text-white text-sm font-medium disabled:opacity-50 cursor-pointer"
                        >
                            {addingModel ? '...' : '+ Добавить'}
                        </button>
                    </div>

                    {/* Models list */}
                    <div className="space-y-2">
                        {allowedModels.map(model => (
                            <div
                                key={model.id}
                                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-lg border ${model.isActive ? 'bg-surface border-border' : 'bg-surface/50 border-border/50 opacity-60'}`}
                            >
                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                    <span className="text-xs px-2 py-0.5 rounded bg-surface-light text-text-muted shrink-0">{model.provider}</span>
                                    <div className="min-w-0">
                                        <span className="text-sm font-medium text-text-primary">{model.displayName}</span>
                                        {model.isDefault && <span className="ml-2 text-xs text-primary">⭐ по умолчанию</span>}
                                        {model.isFallback && <span className="ml-2 text-xs text-warning">🔄 fallback</span>}
                                        {model.isRecommended && <span className="ml-2 text-xs text-success">✨ рекомендуемая</span>}
                                        <p className="text-xs text-text-muted break-all">{model.modelId}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 sm:gap-2 flex-wrap shrink-0">
                                    <button
                                        onClick={async () => {
                                            if (!initData) return;
                                            try {
                                                await apiRequest(`/api/admin/allowed-models/${model.id}`, {
                                                    method: 'PATCH',
                                                    body: { is_fallback: !model.isFallback },
                                                    initData,
                                                });
                                                // If setting as fallback, clear other fallbacks locally
                                                if (!model.isFallback) {
                                                    setAllowedModels(prev => prev.map(m => ({
                                                        ...m,
                                                        isFallback: m.id === model.id ? true : false
                                                    })));
                                                } else {
                                                    setAllowedModels(prev => prev.map(m => m.id === model.id ? { ...m, isFallback: false } : m));
                                                }
                                            } catch (err) {
                                                console.error(err);
                                            }
                                        }}
                                        className={`px-2 py-1 rounded text-xs cursor-pointer ${model.isFallback ? 'bg-warning/20 text-warning' : 'bg-surface-light text-text-muted'}`}
                                    >
                                        {model.isFallback ? '🔄 Fallback' : 'Fallback'}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!initData) return;
                                            try {
                                                await apiRequest(`/api/admin/allowed-models/${model.id}`, {
                                                    method: 'PATCH',
                                                    body: { is_recommended: !model.isRecommended },
                                                    initData,
                                                });
                                                setAllowedModels(prev => prev.map(m => m.id === model.id ? { ...m, isRecommended: !m.isRecommended } : m));
                                            } catch (err) {
                                                console.error(err);
                                            }
                                        }}
                                        className={`px-2 py-1 rounded text-xs cursor-pointer ${model.isRecommended ? 'bg-success/20 text-success' : 'bg-surface-light text-text-muted'}`}
                                    >
                                        {model.isRecommended ? '✨ Рекоменд.' : 'Рекоменд.'}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            if (!initData) return;
                                            try {
                                                await apiRequest(`/api/admin/allowed-models/${model.id}`, {
                                                    method: 'PATCH',
                                                    body: { is_active: !model.isActive },
                                                    initData,
                                                });
                                                setAllowedModels(prev => prev.map(m => m.id === model.id ? { ...m, isActive: !m.isActive } : m));
                                            } catch (err) {
                                                console.error(err);
                                            }
                                        }}
                                        className={`px-2 py-1 rounded text-xs cursor-pointer ${model.isActive ? 'bg-success/20 text-success' : 'bg-surface-light text-text-muted'}`}
                                    >
                                        {model.isActive ? '✓ Активна' : 'Выключена'}
                                    </button>
                                    <button
                                        onClick={async () => {
                                            console.log('delete allowed model clicked', model.id, model.displayName);
                                            if (!initData) {
                                                console.log('delete model: no initData');
                                                return;
                                            }
                                            if (!confirm('Удалить модель?')) {
                                                console.log('delete model: cancelled by user');
                                                return;
                                            }
                                            try {
                                                console.log('delete model: sending DELETE request');
                                                await apiRequest(`/api/admin/allowed-models/${model.id}`, {
                                                    method: 'DELETE',
                                                    initData,
                                                });
                                                console.log('delete model: success');
                                                setAllowedModels(prev => prev.filter(m => m.id !== model.id));
                                            } catch (err) {
                                                console.error('delete model: error', err);
                                                alert('Ошибка удаления модели');
                                            }
                                        }}
                                        className="px-2 py-1 rounded text-xs bg-danger/10 text-danger hover:bg-danger/20 cursor-pointer"
                                    >
                                        Удалить
                                    </button>
                                </div>
                            </div>
                        ))}
                        {allowedModels.length === 0 && (
                            <p className="text-text-muted text-sm">Нет разрешённых моделей</p>
                        )}
                    </div>
                </div>

                {/* UGC Moderation */}
                {pendingCharacters.length > 0 && (
                    <div className="mb-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/30">
                        <h3 className="text-sm font-semibold mb-3 text-yellow-400">
                            ⏳ На модерации ({pendingCharacters.length})
                        </h3>
                        <div className="space-y-3">
                            {pendingCharacters.map(char => (
                                <div key={char.id} className="p-3 rounded-lg bg-surface border border-border">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            {char.avatarUrl ? (
                                                <img src={char.avatarUrl} alt="" className="w-12 h-12 rounded-lg object-cover" />
                                            ) : (
                                                <div className="w-12 h-12 rounded-lg bg-surface-light flex items-center justify-center text-2xl">👤</div>
                                            )}
                                            <div>
                                                <h4 className="font-medium text-text-primary">{char.name}</h4>
                                                <p className="text-xs text-text-muted">от {char.createdBy.name}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => approveCharacter(char.id)}
                                                disabled={moderating === char.id}
                                                className="px-3 py-1.5 rounded-lg text-xs bg-success/20 text-success hover:bg-success/30 disabled:opacity-50 cursor-pointer"
                                            >
                                                ✓ Одобрить
                                            </button>
                                            <button
                                                onClick={() => rejectCharacter(char.id)}
                                                disabled={moderating === char.id}
                                                className="px-3 py-1.5 rounded-lg text-xs bg-danger/20 text-danger hover:bg-danger/30 disabled:opacity-50 cursor-pointer"
                                            >
                                                ✕ Отклонить
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => setExpandedPending(expandedPending === char.id ? null : char.id)}
                                        className="mt-2 text-xs text-primary hover:underline cursor-pointer"
                                    >
                                        {expandedPending === char.id ? 'Скрыть детали ▲' : 'Показать детали ▼'}
                                    </button>
                                    {expandedPending === char.id && (
                                        <div className="mt-3 space-y-2 text-sm">
                                            <div>
                                                <span className="text-text-muted">Описание:</span>
                                                <p className="text-text-secondary mt-1">{char.description}</p>
                                            </div>
                                            <div>
                                                <span className="text-text-muted">Системный промпт:</span>
                                                <pre className="mt-1 p-2 rounded bg-slate-900 text-xs text-primary whitespace-pre-wrap">
                                                    {char.systemPrompt}
                                                </pre>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Rejection Reason Modal */}
                {rejectModalCharId && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                        <div className="bg-surface rounded-xl p-6 max-w-md w-full border border-border">
                            <h3 className="text-lg font-semibold text-text-primary mb-4">Причина отклонения</h3>
                            <textarea
                                value={rejectionReason}
                                onChange={e => setRejectionReason(e.target.value)}
                                placeholder="Укажите причину отклонения персонажа..."
                                className="w-full px-3 py-2 rounded-lg bg-surface-light border border-border text-text-primary text-sm min-h-[100px] resize-none"
                                autoFocus
                            />
                            <div className="flex justify-end gap-2 mt-4">
                                <button
                                    onClick={cancelReject}
                                    className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-light cursor-pointer"
                                >
                                    Отмена
                                </button>
                                <button
                                    onClick={confirmRejectCharacter}
                                    disabled={!rejectionReason.trim() || moderating !== null}
                                    className="px-4 py-2 rounded-lg text-sm bg-danger text-white hover:bg-danger/80 disabled:opacity-50 cursor-pointer"
                                >
                                    {moderating ? 'Отклонение...' : 'Отклонить'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Rejected Characters */}
                {rejectedCharacters.length > 0 && (
                    <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/30">
                        <h3 className="text-sm font-semibold mb-3 text-red-400">
                            ❌ Отклонённые ({rejectedCharacters.length})
                        </h3>
                        <div className="space-y-3">
                            {rejectedCharacters.map(char => (
                                <div key={char.id} className="p-3 rounded-lg bg-surface border border-border">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            {char.avatarUrl ? (
                                                <img src={char.avatarUrl} alt="" className="w-12 h-12 rounded-lg object-cover opacity-60" />
                                            ) : (
                                                <div className="w-12 h-12 rounded-lg bg-surface-light flex items-center justify-center text-2xl opacity-60">👤</div>
                                            )}
                                            <div>
                                                <h4 className="font-medium text-text-primary">{char.name}</h4>
                                                <p className="text-xs text-text-muted">от {char.createdBy.name}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-2 p-2 rounded bg-red-500/10 border border-red-500/20">
                                        <span className="text-xs text-red-400">Причина: </span>
                                        <span className="text-xs text-text-secondary">{char.rejectionReason}</span>
                                    </div>
                                    <button
                                        onClick={() => setExpandedRejected(expandedRejected === char.id ? null : char.id)}
                                        className="mt-2 text-xs text-primary hover:underline cursor-pointer"
                                    >
                                        {expandedRejected === char.id ? 'Скрыть детали ▲' : 'Показать детали ▼'}
                                    </button>
                                    {expandedRejected === char.id && (
                                        <div className="mt-3 space-y-2 text-sm">
                                            <div>
                                                <span className="text-text-muted">Описание:</span>
                                                <p className="text-text-secondary mt-1">{char.description}</p>
                                            </div>
                                            <div>
                                                <span className="text-text-muted">Системный промпт:</span>
                                                <pre className="mt-1 p-2 rounded bg-slate-900 text-xs text-primary whitespace-pre-wrap">
                                                    {char.systemPrompt}
                                                </pre>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                )}                {/* System Prompt */}
                <div className="mb-6">
                    <h3 className="text-sm font-semibold mb-2 text-text-secondary">Общий системный промпт</h3>
                    <pre className="p-3 rounded-lg bg-slate-900/80 border border-border text-primary text-xs font-mono whitespace-pre-wrap">
                        {commonPrompt}
                    </pre>
                </div>

                {/* Characters */}
                <div className="flex flex-col gap-3 mb-3">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-text-secondary">Персонажи ({filteredCharacters.length}{debouncedSearch ? ` из ${characters.length}` : ''})</h3>
                        <button
                            onClick={startCreate}
                            className="px-3 py-1.5 rounded-lg text-xs bg-gradient-to-r from-primary to-indigo-500 text-white
                                hover:shadow-lg hover:shadow-primary/20 transition-all cursor-pointer"
                        >
                            + Создать
                        </button>
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Поиск по имени, описанию, автору..."
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-primary text-sm placeholder:text-text-muted"
                    />
                </div>

                {/* Create Form */}
                {isCreating && (
                    <div className="p-4 rounded-xl bg-surface-light border border-primary/30 mb-3">
                        <h4 className="text-sm font-semibold text-primary mb-3">Новый персонаж</h4>
                        <CharacterEditForm
                            editForm={editForm}
                            setEditForm={setEditForm}
                            models={currentModels}
                            loadingModels={loadingModels}
                            onSave={createCharacter}
                            onCancel={cancelEdit}
                            validationError={validationError}
                            availableTags={availableTags}
                        />
                    </div>
                )}

                <div className="space-y-3">
                    {filteredCharacters.map(char => (
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
                                    onDelete={deleteCharacterById}
                                />
                            )}
                        </div>
                    ))}
                </div>

                {/* Uploads Management */}
                <div className="mt-8 mb-6 p-4 rounded-xl bg-surface-light border border-border">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-text-secondary">📁 Загруженные файлы ({uploads.length})</h3>
                        <button
                            onClick={deleteUnusedUploads}
                            disabled={deletingUnused}
                            className="px-3 py-1.5 rounded-lg text-xs bg-danger/10 text-danger hover:bg-danger/20 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                            {deletingUnused ? 'Удаление...' : `🗑 Удалить неиспользуемые (${uploads.filter(f => !usedUploads.includes(f.filename)).length})`}
                        </button>
                    </div>
                    {uploads.length === 0 ? (
                        <p className="text-text-muted text-sm">Нет загруженных файлов</p>
                    ) : (
                        <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2">
                            {uploads.map(file => {
                                const isUsed = usedUploads.includes(file.filename);
                                return (
                                    <div
                                        key={file.filename}
                                        className={`relative group aspect-square rounded-lg overflow-hidden border ${isUsed ? 'border-success/50' : 'border-danger/50'}`}
                                        title={`${file.filename}\n${(file.size / 1024).toFixed(1)} KB\n${isUsed ? 'Используется' : 'Не используется'}`}
                                    >
                                        <img
                                            src={file.url}
                                            alt={file.filename}
                                            className="w-full h-full object-cover"
                                        />
                                        <div className={`absolute inset-0 ${isUsed ? 'bg-success/10' : 'bg-danger/10'}`} />
                                        {!isUsed && (
                                            <div className="absolute top-1 right-1 w-2 h-2 rounded-full bg-danger animate-pulse" />
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
