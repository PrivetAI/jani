import { useEffect, useState } from 'react';
import { useUserStore } from '../store/userStore';
import { apiRequest } from '../lib/api';

interface Character {
    id: number;
    name: string;
    description: string;
    systemPrompt: string;
    accessType: 'free' | 'premium';
    isActive: boolean;
    avatarUrl?: string;
    // Catalog settings
    genre?: string | null;
    contentRating?: 'sfw' | 'nsfw' | null;
    grammaticalGender?: 'male' | 'female';
    // Initial relationship
    initialAttraction?: number;
    initialTrust?: number;
    initialAffection?: number;
    initialDominance?: number;
    // LLM settings
    llmProvider?: 'openrouter' | 'gemini' | null;
    llmModel?: string | null;
    llmTemperature?: number | null;
    llmTopP?: number | null;
    llmRepetitionPenalty?: number | null;
}

interface GeminiModel {
    id: string;
    name: string;
}

export function AdminPage() {
    const { profile, initData } = useUserStore();
    const [stats, setStats] = useState<any>(null);
    const [characters, setCharacters] = useState<Character[]>([]);
    const [commonPrompt, setCommonPrompt] = useState('');
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<Partial<Character>>({});
    const [geminiModels, setGeminiModels] = useState<GeminiModel[]>([]);
    const [loadingModels, setLoadingModels] = useState(false);

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
        }
    }, [initData, profile]);

    // Fetch Gemini models when provider is gemini
    useEffect(() => {
        if (editForm.llmProvider === 'gemini' && initData && geminiModels.length === 0) {
            setLoadingModels(true);
            apiRequest('/api/admin/gemini-models', { initData })
                .then((data: any) => setGeminiModels(data.models || []))
                .catch(console.error)
                .finally(() => setLoadingModels(false));
        }
    }, [editForm.llmProvider, initData, geminiModels.length]);

    const startEdit = (char: Character) => {
        setEditingId(char.id);
        setEditForm(char);
    };

    const cancelEdit = () => {
        setEditingId(null);
        setEditForm({});
    };

    const saveEdit = async () => {
        if (!editingId || !initData) return;
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
                    // Catalog settings
                    genre: editForm.genre || null,
                    content_rating: editForm.contentRating || null,
                    grammatical_gender: editForm.grammaticalGender || 'female',
                    // Initial relationship
                    initial_attraction: editForm.initialAttraction ?? 0,
                    initial_trust: editForm.initialTrust ?? 10,
                    initial_affection: editForm.initialAffection ?? 5,
                    initial_dominance: editForm.initialDominance ?? 0,
                    // LLM settings (convert empty to null)
                    llm_provider: editForm.llmProvider || null,
                    llm_model: editForm.llmModel || null,
                    llm_temperature: editForm.llmTemperature ?? null,
                    llm_top_p: editForm.llmTopP ?? null,
                    llm_repetition_penalty: editForm.llmRepetitionPenalty ?? null,
                },
                initData,
            });
            setCharacters(chars => chars.map(c => c.id === editingId ? { ...c, ...editForm } as Character : c));
            cancelEdit();
        } catch (err) {
            alert('Ошибка сохранения');
        }
    };

    const inputClass = "w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-primary/50";
    const labelClass = "block text-xs text-text-muted mb-1";

    if (!profile?.isAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-danger">Доступ запрещен</div>
            </div>
        );
    }

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
                                <div className="max-h-[70vh] overflow-y-auto pr-2 -mr-2">
                                    <div className="space-y-4">
                                        {/* Basic Info */}
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className={labelClass}>Имя</label>
                                                <input
                                                    value={editForm.name || ''}
                                                    onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                                    className={inputClass}
                                                />
                                            </div>
                                            <div>
                                                <label className={labelClass}>Avatar URL</label>
                                                <input
                                                    value={editForm.avatarUrl || ''}
                                                    onChange={e => setEditForm({ ...editForm, avatarUrl: e.target.value })}
                                                    className={inputClass}
                                                    placeholder="https://..."
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className={labelClass}>Описание</label>
                                            <textarea
                                                value={editForm.description || ''}
                                                onChange={e => setEditForm({ ...editForm, description: e.target.value })}
                                                rows={2}
                                                className={inputClass + " resize-none"}
                                            />
                                        </div>

                                        <div>
                                            <label className={labelClass}>Системный промпт</label>
                                            <textarea
                                                value={editForm.systemPrompt || ''}
                                                onChange={e => setEditForm({ ...editForm, systemPrompt: e.target.value })}
                                                rows={4}
                                                className={inputClass + " resize-none font-mono"}
                                            />
                                        </div>

                                        {/* Access & Status */}
                                        <div className="flex gap-4 items-center flex-wrap">
                                            <div>
                                                <label className={labelClass}>Доступ</label>
                                                <select
                                                    value={editForm.accessType || 'free'}
                                                    onChange={e => setEditForm({ ...editForm, accessType: e.target.value as 'free' | 'premium' })}
                                                    className={inputClass + " w-32"}
                                                >
                                                    <option value="free">Free</option>
                                                    <option value="premium">Premium</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className={labelClass}>Рейтинг</label>
                                                <select
                                                    value={editForm.contentRating || 'sfw'}
                                                    onChange={e => setEditForm({ ...editForm, contentRating: e.target.value as 'sfw' | 'nsfw' })}
                                                    className={inputClass + " w-32"}
                                                >
                                                    <option value="sfw">SFW</option>
                                                    <option value="nsfw">NSFW</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className={labelClass}>Род (он/она)</label>
                                                <select
                                                    value={editForm.grammaticalGender || 'female'}
                                                    onChange={e => setEditForm({ ...editForm, grammaticalGender: e.target.value as 'male' | 'female' })}
                                                    className={inputClass + " w-32"}
                                                >
                                                    <option value="female">Она</option>
                                                    <option value="male">Он</option>
                                                </select>
                                            </div>
                                            <label className="flex items-center gap-2 text-text-secondary cursor-pointer mt-4">
                                                <input
                                                    type="checkbox"
                                                    checked={editForm.isActive ?? true}
                                                    onChange={e => setEditForm({ ...editForm, isActive: e.target.checked })}
                                                    className="w-4 h-4 rounded"
                                                />
                                                Активен
                                            </label>
                                        </div>

                                        {/* Catalog Settings */}
                                        <div className="border-t border-border pt-4 mt-4">
                                            <h4 className="text-xs font-semibold text-primary mb-3">📚 Каталог</h4>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                                <div>
                                                    <label className={labelClass}>Жанр</label>
                                                    <input
                                                        value={editForm.genre || ''}
                                                        onChange={e => setEditForm({ ...editForm, genre: e.target.value || null })}
                                                        className={inputClass}
                                                        placeholder="romance, fantasy, anime..."
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Initial Relationship */}
                                        <div className="border-t border-border pt-4 mt-4">
                                            <h4 className="text-xs font-semibold text-primary mb-3">💕 Начальные отношения (-50 до +50)</h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                <div>
                                                    <label className={labelClass}>Влечение</label>
                                                    <input
                                                        type="number"
                                                        min="-50"
                                                        max="50"
                                                        value={editForm.initialAttraction ?? 0}
                                                        onChange={e => setEditForm({ ...editForm, initialAttraction: parseInt(e.target.value) || 0 })}
                                                        className={inputClass}
                                                    />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>Доверие</label>
                                                    <input
                                                        type="number"
                                                        min="-50"
                                                        max="50"
                                                        value={editForm.initialTrust ?? 10}
                                                        onChange={e => setEditForm({ ...editForm, initialTrust: parseInt(e.target.value) || 0 })}
                                                        className={inputClass}
                                                    />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>Привязанность</label>
                                                    <input
                                                        type="number"
                                                        min="-50"
                                                        max="50"
                                                        value={editForm.initialAffection ?? 5}
                                                        onChange={e => setEditForm({ ...editForm, initialAffection: parseInt(e.target.value) || 0 })}
                                                        className={inputClass}
                                                    />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>Доминирование</label>
                                                    <input
                                                        type="number"
                                                        min="-50"
                                                        max="50"
                                                        value={editForm.initialDominance ?? 0}
                                                        onChange={e => setEditForm({ ...editForm, initialDominance: parseInt(e.target.value) || 0 })}
                                                        className={inputClass}
                                                    />
                                                </div>
                                            </div>
                                        </div>


                                        {/* LLM Settings */}
                                        <div className="border-t border-border pt-4 mt-4">
                                            <h4 className="text-xs font-semibold text-primary mb-3">⚙️ LLM Настройки (пусто = глобальные)</h4>

                                            <div className="mb-3">
                                                <label className={labelClass}>Provider</label>
                                                <select
                                                    value={editForm.llmProvider || ''}
                                                    onChange={e => setEditForm({ ...editForm, llmProvider: (e.target.value as any) || null })}
                                                    className={inputClass + " w-full sm:w-1/2"}
                                                >
                                                    <option value="">Default (OpenRouter)</option>
                                                    <option value="openrouter">OpenRouter</option>
                                                    <option value="gemini">Gemini</option>
                                                </select>
                                            </div>

                                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                <div>
                                                    <label className={labelClass}>Model</label>
                                                    {editForm.llmProvider === 'gemini' ? (
                                                        <select
                                                            value={editForm.llmModel || ''}
                                                            onChange={e => setEditForm({ ...editForm, llmModel: e.target.value || null })}
                                                            className={inputClass}
                                                            disabled={loadingModels}
                                                        >
                                                            <option value="">{loadingModels ? 'Загрузка...' : 'По умолчанию'}</option>
                                                            {geminiModels.map(m => (
                                                                <option key={m.id} value={m.id}>{m.name}</option>
                                                            ))}
                                                        </select>
                                                    ) : (
                                                        <input
                                                            value={editForm.llmModel || ''}
                                                            onChange={e => setEditForm({ ...editForm, llmModel: e.target.value || null })}
                                                            className={inputClass}
                                                            placeholder="auto"
                                                        />
                                                    )}
                                                </div>
                                                <div>
                                                    <label className={labelClass}>Temperature</label>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        max="2"
                                                        value={editForm.llmTemperature ?? ''}
                                                        onChange={e => setEditForm({ ...editForm, llmTemperature: e.target.value ? parseFloat(e.target.value) : null })}
                                                        className={inputClass}
                                                        placeholder="1.02"
                                                    />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>Top P</label>
                                                    <input
                                                        type="number"
                                                        step="0.1"
                                                        min="0"
                                                        max="1"
                                                        value={editForm.llmTopP ?? ''}
                                                        onChange={e => setEditForm({ ...editForm, llmTopP: e.target.value ? parseFloat(e.target.value) : null })}
                                                        className={inputClass}
                                                        placeholder="0.9"
                                                    />
                                                </div>
                                                <div>
                                                    <label className={labelClass}>Rep. Penalty</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        max="3"
                                                        value={editForm.llmRepetitionPenalty ?? ''}
                                                        onChange={e => setEditForm({ ...editForm, llmRepetitionPenalty: e.target.value ? parseFloat(e.target.value) : null })}
                                                        className={inputClass}
                                                        placeholder="1.12"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex gap-3 pt-2">
                                            <button
                                                onClick={saveEdit}
                                                className="flex-1 py-2.5 rounded-xl font-medium text-white bg-gradient-to-r from-primary to-indigo-500"
                                            >
                                                Сохранить
                                            </button>
                                            <button
                                                onClick={cancelEdit}
                                                className="flex-1 py-2.5 rounded-xl font-medium bg-surface border border-border text-text-secondary hover:text-text-primary"
                                            >
                                                Отмена
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex items-center gap-3 flex-wrap">
                                    <span className="font-semibold text-text-primary">{char.name}</span>
                                    <span className={`px-2 py-0.5 rounded-full text-xs ${char.accessType === 'premium'
                                        ? 'bg-purple-500/20 text-purple-400'
                                        : 'bg-success/20 text-success'
                                        }`}>
                                        {char.accessType}
                                    </span>
                                    <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs ${char.isActive
                                        ? 'bg-success/20 text-success'
                                        : 'bg-danger/20 text-danger'
                                        }`}>
                                        {char.isActive ? '✓' : '✗'}
                                    </span>
                                    {char.genre && (
                                        <span className="text-xs text-text-muted">{char.genre}</span>
                                    )}
                                    {char.llmProvider && (
                                        <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                                            {char.llmProvider}{char.llmModel ? `: ${char.llmModel.slice(0, 20)}` : ''}
                                        </span>
                                    )}
                                    {char.llmTemperature && (
                                        <span className="text-xs text-text-muted">T:{char.llmTemperature}</span>
                                    )}
                                    <button
                                        onClick={() => startEdit(char)}
                                        className="ml-auto px-3 py-1.5 rounded-lg text-xs bg-surface border border-border text-text-secondary
                                            hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
                                    >
                                        Редактировать
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
