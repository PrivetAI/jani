import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { apiRequest } from '../lib/api';
import { getImageUrl } from '../lib/imageUrl';

interface Tag {
    id: number;
    name: string;
}

interface AllowedModel {
    id: number;
    modelId: string;
    displayName: string;
    provider: string;
    isDefault: boolean;
}

interface CharacterData {
    id: number;
    name: string;
    description: string;
    avatarUrl: string | null;
    systemPrompt: string;
    grammaticalGender: 'male' | 'female';
    initialAttraction: number;
    initialTrust: number;
    initialAffection: number;
    initialDominance: number;
    tagIds: number[];
    llmModel: string | null;
    llmProvider: string | null;
    llmTemperature: number | null;
    llmTopP: number | null;
    llmRepetitionPenalty: number | null;
}

export function CreateCharacterPage() {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const { initData, profile } = useUserStore();

    const isEdit = Boolean(id);

    const [loading, setLoading] = useState(isEdit);
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [systemPrompt, setSystemPrompt] = useState('');
    const [avatarUrl, setAvatarUrl] = useState('');
    const [gender, setGender] = useState<'male' | 'female'>('female');
    const [initialAttraction, setInitialAttraction] = useState(0);
    const [initialTrust, setInitialTrust] = useState(10);
    const [initialAffection, setInitialAffection] = useState(5);
    const [initialDominance, setInitialDominance] = useState(0);
    const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
    const [availableTags, setAvailableTags] = useState<Tag[]>([]);
    const [availableModels, setAvailableModels] = useState<AllowedModel[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>(''); // empty = default
    // LLM параметры: null = авто (глобальные настройки)
    const [temperature, setTemperature] = useState<number | null>(null);
    const [topP, setTopP] = useState<number | null>(null);
    const [repetitionPenalty, setRepetitionPenalty] = useState<number | null>(null);
    const [uploading, setUploading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Load tags and character data (for edit mode)
    useEffect(() => {
        if (!initData) return;

        const loadData = async () => {
            try {
                // Always load tags
                const tagsData = await apiRequest<{ tags: Tag[] }>('/api/tags?all=true', { initData });
                setAvailableTags(tagsData.tags || []);

                // Load allowed models
                const modelsData = await apiRequest<{ models: AllowedModel[] }>('/api/allowed-models', { initData });
                setAvailableModels(modelsData.models || []);

                // Load character data if editing
                if (isEdit && id) {
                    const charData = await apiRequest<{ character: CharacterData }>(`/api/characters/${id}/edit`, { initData });
                    const c = charData.character;
                    setName(c.name);
                    setDescription(c.description);
                    setSystemPrompt(c.systemPrompt);
                    setAvatarUrl(c.avatarUrl || '');
                    setGender(c.grammaticalGender);
                    setInitialAttraction(c.initialAttraction);
                    setInitialTrust(c.initialTrust);
                    setInitialAffection(c.initialAffection);
                    setInitialDominance(c.initialDominance);
                    setSelectedTagIds(c.tagIds);
                    setSelectedModel(c.llmModel || '');
                    setTemperature(c.llmTemperature != null ? Number(c.llmTemperature) : null);
                    setTopP(c.llmTopP != null ? Number(c.llmTopP) : null);
                    setRepetitionPenalty(c.llmRepetitionPenalty != null ? Number(c.llmRepetitionPenalty) : null);
                }
            } catch (err: any) {
                setError(err.message || 'Ошибка загрузки');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [initData, isEdit, id]);

    // Check if user has nickname
    if (profile && !profile.nickname) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center px-4">
                <h1 className="text-2xl font-bold text-text-primary mb-2">Нужен никнейм</h1>
                <p className="text-text-secondary text-center mb-6">
                    Для создания персонажа необходимо заполнить никнейм в профиле.
                </p>
                <button
                    onClick={() => navigate('/profile')}
                    className="px-6 py-3 bg-primary text-white rounded-xl font-medium"
                >
                    Перейти в профиль
                </button>
            </div>
        );
    }

    const handleUploadAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !initData) return;

        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);

            const result = await apiRequest<{ url: string }>('/api/admin/upload', {
                method: 'POST',
                body: formData,
                initData
            });
            setAvatarUrl(result.url);
        } catch (err: any) {
            setError(err.message || 'Ошибка загрузки изображения');
        } finally {
            setUploading(false);
        }
    };

    const handleSubmit = async () => {
        if (!initData || submitting) return;

        if (!name.trim() || !description.trim() || !systemPrompt.trim() || !selectedModel) {
            setError('Заполните все обязательные поля (включая выбор модели)');
            return;
        }

        setSubmitting(true);
        setError(null);

        try {
            const body = {
                name: name.trim(),
                description_long: description.trim(),
                system_prompt: systemPrompt.trim(),
                avatar_url: avatarUrl || null,
                grammatical_gender: gender,
                initial_attraction: initialAttraction,
                initial_trust: initialTrust,
                initial_affection: initialAffection,
                initial_dominance: initialDominance,
                tag_ids: selectedTagIds,
                llm_model: selectedModel || null,
                llm_provider: selectedModel ? availableModels.find(m => m.modelId === selectedModel)?.provider || null : null,
                llm_temperature: temperature,
                llm_top_p: topP,
                llm_repetition_penalty: repetitionPenalty,
            };

            if (isEdit) {
                await apiRequest(`/api/characters/${id}`, { method: 'PUT', body, initData });
            } else {
                await apiRequest('/api/characters', { method: 'POST', body, initData });
            }
            setSuccess(true);
        } catch (err: any) {
            setError(err.message || 'Ошибка сохранения персонажа');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-text-secondary animate-pulse-slow">Загрузка...</div>
            </div>
        );
    }

    if (success) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center px-4">
                <h1 className="text-2xl font-bold text-text-primary mb-2">
                    {isEdit ? 'Персонаж обновлён!' : 'Персонаж создан!'}
                </h1>
                <p className="text-text-secondary text-center mb-6">
                    {isEdit
                        ? 'Изменения отправлены на модерацию. После проверки персонаж снова появится в каталоге.'
                        : 'Ваш персонаж отправлен на модерацию. После проверки он появится в каталоге.'
                    }
                </p>
                <button
                    onClick={() => navigate('/profile')}
                    className="px-6 py-3 bg-primary text-white rounded-xl font-medium"
                >
                    К моим персонажам
                </button>
            </div>
        );
    }

    const toggleTag = (tagId: number) => {
        setSelectedTagIds(prev =>
            prev.includes(tagId)
                ? prev.filter(t => t !== tagId)
                : [...prev, tagId]
        );
    };

    return (
        <div className="min-h-screen pb-24">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-surface/80 backdrop-blur-sm border-b border-border px-4 py-3">
                <div className="flex items-center justify-between">
                    <button onClick={() => navigate(-1)} className="text-text-secondary hover:text-text-primary transition-colors">
                        ← Назад
                    </button>
                    <h1 className="text-lg font-semibold text-text-primary">
                        {isEdit ? 'Редактировать персонажа' : 'Новый персонаж'}
                    </h1>
                    <div className="w-16" />
                </div>
            </div>

            {error && (
                <div className="mx-4 mt-4 p-3 rounded-xl bg-danger/20 border border-danger text-danger text-sm">
                    {error}
                </div>
            )}

            <div className="px-4 space-y-4 mt-4">
                {/* Avatar */}
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                        Аватар
                    </label>
                    <div className="flex items-center gap-4">
                        {avatarUrl ? (
                            <img
                                src={getImageUrl(avatarUrl)}
                                alt="Avatar"
                                className="w-32 h-32 rounded-xl object-cover"
                            />
                        ) : (
                            <div className="w-32 h-32 rounded-xl bg-surface-light flex items-center justify-center text-5xl">
                                👤
                            </div>
                        )}
                        <label className="px-4 py-2 bg-surface-light border border-border rounded-xl cursor-pointer
                            hover:border-primary transition-colors">
                            <span className="text-sm">{uploading ? 'Загрузка...' : 'Загрузить'}</span>
                            <input
                                type="file"
                                accept="image/*"
                                onChange={handleUploadAvatar}
                                className="hidden"
                                disabled={uploading}
                            />
                        </label>
                    </div>
                </div>

                {/* Name */}
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                        Имя персонажа *
                    </label>
                    <input
                        type="text"
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Например: Сакура, Виктория, Кай"
                        maxLength={100}
                        className="w-full px-4 py-3 rounded-xl bg-surface-light border border-border
                            focus:border-primary focus:outline-none transition-colors
                            placeholder:text-text-muted"
                    />
                </div>

                {/* Description */}
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                        Описание персонажа *
                    </label>
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        placeholder="Расскажите о персонаже: характер, история, особенности..."
                        maxLength={2000}
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl bg-surface-light border border-border
                            focus:border-primary focus:outline-none resize-none transition-colors
                            placeholder:text-text-muted"
                    />
                    <p className="mt-1 text-xs text-text-muted text-right">{description.length}/2000</p>
                </div>

                {/* System Prompt */}
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                        Системный промпт *
                    </label>
                    <textarea
                        value={systemPrompt}
                        onChange={e => setSystemPrompt(e.target.value)}
                        placeholder="Ты — молодая волшебница по имени Лира. Тебе 19 лет. Ты учишься в академии магии и увлекаешься артефактологией. Характер: любопытная, немного застенчивая, но смелая когда дело касается магии. Говоришь мягко и вдумчиво. Любишь книги и травяной чай."
                        maxLength={4000}
                        rows={8}
                        className="w-full px-4 py-3 rounded-xl bg-surface-light border border-border
                            focus:border-primary focus:outline-none resize-none transition-colors
                            placeholder:text-text-muted"
                    />
                    <p className="mt-1 text-xs text-text-muted text-right">{systemPrompt.length}/4000</p>
                </div>

                {/* Gender */}
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                        Пол персонажа
                    </label>
                    <select
                        value={gender}
                        onChange={e => setGender(e.target.value as 'male' | 'female')}
                        className="w-full px-4 py-3 rounded-xl bg-surface-light border border-border
                            focus:border-primary focus:outline-none transition-colors"
                    >
                        <option value="female">Женский</option>
                        <option value="male">Мужской</option>
                    </select>
                </div>

                {/* Model Selection */}
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                        Модель LLM *
                    </label>
                    <select
                        value={selectedModel}
                        onChange={e => setSelectedModel(e.target.value)}
                        className="w-full px-4 py-3 rounded-xl bg-surface-light border border-border
                            focus:border-primary focus:outline-none transition-colors"
                    >
                        <option value="">Выберите модель...</option>
                        {availableModels.map(model => (
                            <option key={model.id} value={model.modelId}>
                                {model.displayName}
                            </option>
                        ))}
                    </select>
                </div>

                {/* LLM Parameters */}
                <div className="space-y-4 p-4 rounded-xl bg-surface-light border border-border">
                    <h3 className="text-sm font-medium text-text-secondary">Параметры генерации (опционально)</h3>

                    {/* Temperature */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-text-muted">🌡️ Temperature</span>
                            <label className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={temperature === null}
                                    onChange={e => setTemperature(e.target.checked ? null : 1.0)}
                                    className="accent-primary"
                                />
                                Авто
                            </label>
                        </div>
                        {temperature !== null && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min="0"
                                    max="2"
                                    step="0.05"
                                    value={temperature}
                                    onChange={e => setTemperature(Number(e.target.value))}
                                    className="flex-1 accent-primary"
                                />
                                <span className="text-xs text-text-muted w-10 text-right">{temperature.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    {/* Top P */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-text-muted">📊 Top P</span>
                            <label className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={topP === null}
                                    onChange={e => setTopP(e.target.checked ? null : 0.9)}
                                    className="accent-primary"
                                />
                                Авто
                            </label>
                        </div>
                        {topP !== null && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min="0"
                                    max="1"
                                    step="0.05"
                                    value={topP}
                                    onChange={e => setTopP(Number(e.target.value))}
                                    className="flex-1 accent-primary"
                                />
                                <span className="text-xs text-text-muted w-10 text-right">{topP.toFixed(2)}</span>
                            </div>
                        )}
                    </div>

                    {/* Repetition Penalty */}
                    <div>
                        <div className="flex items-center justify-between mb-2">
                            <span className="text-xs text-text-muted">🔄 Repetition Penalty</span>
                            <label className="flex items-center gap-2 text-xs">
                                <input
                                    type="checkbox"
                                    checked={repetitionPenalty === null}
                                    onChange={e => setRepetitionPenalty(e.target.checked ? null : 1.1)}
                                    className="accent-primary"
                                />
                                Авто
                            </label>
                        </div>
                        {repetitionPenalty !== null && (
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min="0.5"
                                    max="2"
                                    step="0.05"
                                    value={repetitionPenalty}
                                    onChange={e => setRepetitionPenalty(Number(e.target.value))}
                                    className="flex-1 accent-primary"
                                />
                                <span className="text-xs text-text-muted w-10 text-right">{repetitionPenalty.toFixed(2)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Relationship Sliders */}
                <div className="space-y-4 p-4 rounded-xl bg-surface-light border border-border">
                    <h3 className="text-sm font-medium text-text-secondary">Начальные отношения</h3>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <div className="flex justify-between text-xs text-text-muted mb-1">
                                <span>❤️ Влечение</span>
                                <span>{initialAttraction}</span>
                            </div>
                            <input type="range" min="-50" max="50" value={initialAttraction}
                                onChange={e => setInitialAttraction(Number(e.target.value))}
                                className="w-full accent-primary" />
                        </div>

                        <div>
                            <div className="flex justify-between text-xs text-text-muted mb-1">
                                <span>🤝 Доверие</span>
                                <span>{initialTrust}</span>
                            </div>
                            <input type="range" min="-50" max="50" value={initialTrust}
                                onChange={e => setInitialTrust(Number(e.target.value))}
                                className="w-full accent-primary" />
                        </div>

                        <div>
                            <div className="flex justify-between text-xs text-text-muted mb-1">
                                <span>💕 Привязанность</span>
                                <span>{initialAffection}</span>
                            </div>
                            <input type="range" min="-50" max="50" value={initialAffection}
                                onChange={e => setInitialAffection(Number(e.target.value))}
                                className="w-full accent-primary" />
                        </div>

                        <div>
                            <div className="flex justify-between text-xs text-text-muted mb-1">
                                <span>👑 Доминирование</span>
                                <span>{initialDominance}</span>
                            </div>
                            <input type="range" min="-50" max="50" value={initialDominance}
                                onChange={e => setInitialDominance(Number(e.target.value))}
                                className="w-full accent-primary" />
                        </div>
                    </div>
                </div>

                {/* Tags */}
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                        Теги (выберите подходящие)
                    </label>
                    <div className="flex flex-wrap gap-2 p-3 rounded-xl bg-surface-light border border-border">
                        {availableTags.map(tag => (
                            <button
                                key={tag.id}
                                type="button"
                                onClick={() => toggleTag(tag.id)}
                                className={`px-3 py-1 rounded-full text-sm transition-all cursor-pointer ${selectedTagIds.includes(tag.id)
                                    ? 'bg-primary text-white'
                                    : 'bg-surface border border-border text-text-secondary hover:border-primary'
                                    }`}
                            >
                                {tag.name}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Submit */}
                <button
                    onClick={handleSubmit}
                    disabled={submitting || !name.trim() || !description.trim() || !systemPrompt.trim() || !selectedModel}
                    className="w-full py-4 rounded-xl font-semibold text-white transition-all cursor-pointer
                        bg-gradient-to-r from-primary to-indigo-500 
                        hover:shadow-lg hover:shadow-primary/30
                        disabled:opacity-50 disabled:cursor-not-allowed mt-6"
                >
                    {submitting ? 'Сохранение...' : (isEdit ? 'Сохранить изменения' : 'Создать персонажа')}
                </button>

                {isEdit && (
                    <p className="text-xs text-text-muted text-center pb-8">
                        После сохранения персонаж будет отправлен на повторную модерацию
                    </p>
                )}
            </div>
        </div>
    );
}
