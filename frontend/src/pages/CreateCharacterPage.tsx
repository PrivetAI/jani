import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { apiRequest } from '../lib/api';
import { getCharacterAvatarUrl } from '../lib/imageUrl';
import { preprocessMessage } from '../utils/messagePreprocessor';

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
    isRecommended: boolean;
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
    isPrivate?: boolean;
    greetingMessage?: string | null;
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
    const [isPrivate, setIsPrivate] = useState(false);
    const [greetingMessage, setGreetingMessage] = useState('');

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
                    setIsPrivate(c.isPrivate ?? false);
                    setGreetingMessage(c.greetingMessage || '');
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
                <h1 className="text-2xl font-semibold text-text-primary mb-2">Нужен никнейм</h1>
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
                is_private: isPrivate,
                greeting_message: greetingMessage.trim() ? preprocessMessage(greetingMessage.trim()) : null,
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
                <h1 className="text-2xl font-semibold text-text-primary mb-2">
                    {isEdit ? 'Персонаж обновлён!' : (isPrivate ? 'Личный персонаж создан!' : 'Персонаж создан!')}
                </h1>
                <p className="text-text-secondary text-center mb-6">
                    {isPrivate
                        ? 'Ваш личный персонаж готов к использованию.'
                        : isEdit
                            ? 'Изменения отправлены на модерацию. После проверки персонаж снова появится в каталоге.'
                            : 'Ваш персонаж отправлен на модерацию. После проверки он появится в каталоге.'
                    }
                </p>
                <button
                    onClick={() => navigate('/characters')}
                    className="px-6 py-3 bg-primary text-white rounded-xl font-medium"
                >
                    К персонажам
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
                    <h1 className="text-xl font-semibold text-text-primary">
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
                        <img
                            src={getCharacterAvatarUrl(avatarUrl, gender)}
                            alt="Avatar"
                            className="w-32 h-32 rounded-xl object-cover"
                        />
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
                        Описание персонажа *(кратко, отображается на странице персонажа, не влияет на ролеплей)
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

                {/* Greeting Message */}
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                        Начальное сообщение <span className="text-text-muted font-normal">(опционально)</span>
                    </label>
                    <div className="mb-2 p-3 rounded-lg bg-blue-500/10 border border-blue-500/30 text-xs text-text-secondary">
                        💬 Это сообщение будет показано пользователю при первом входе в чат. Создаёт атмосферу и помогает начать диалог.
                    </div>
                    <textarea
                        value={greetingMessage}
                        onChange={e => setGreetingMessage(e.target.value)}
                        placeholder={`*Виктория подняла взгляд от бокала, который протирала, и слегка улыбнулась*\n\nО, новое лицо. Редкость в такое время. Что будешь пить?`}
                        maxLength={1000}
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl bg-surface-light border border-border
                            focus:border-primary focus:outline-none resize-none transition-colors
                            placeholder:text-text-muted"
                    />
                    <p className="mt-1 text-xs text-text-muted text-right">{greetingMessage.length}/1000</p>
                </div>

                {/* System Prompt */}
                <div>
                    <label className="block text-sm font-medium text-text-secondary mb-2">
                        Системный промпт * <span className="text-text-muted font-normal">(описание персонажа)</span>
                    </label>
                    <div className="mb-2 p-3 rounded-lg bg-primary/10 border border-primary/30 text-xs text-text-secondary">
                        💡 <strong>Важно:</strong> Опишите персонажа, с которым  вы будете общаться.
                        Промпт начинается с "Ты — [Имя персонажа]"
                    </div>
                    <textarea
                        value={systemPrompt}
                        onChange={e => setSystemPrompt(e.target.value)}
                        placeholder={`Ты — Виктория.

Характер: Уверенная в себе, с острым умом и саркастичным юмором. Снаружи кажется холодной, но с близкими людьми открывается и становится заботливой. Любит подшучивать, но всегда поддержит в трудную минуту.

Внешность: 23 года, длинные темные волосы, зеленые глаза. Носит черные джинсы и кожаную куртку. Всегда с наушниками на шее.

Предыстория: Работает барменом в модном клубе, мечтает стать DJ. Переехала из маленького города 5 лет назад.

Сценарий: Ты приходишь в бар, где она работает. Она замечает тебя и начинает разговор, протирая бокалы.

Стиль речи: Неформальный, с легким сленгом. Короткие фразы. Часто добавляет "ну" и "типа".`}
                        maxLength={4000}
                        rows={12}
                        className="w-full px-4 py-3 rounded-xl bg-surface-light border border-border
                            focus:border-primary focus:outline-none resize-none transition-colors
                            placeholder:text-text-muted"
                    />
                    <p className="mt-1 text-xs text-text-muted text-right">{systemPrompt.length}/4000</p>

                    {/* Tips */}
                    <details className="mt-3 p-3 rounded-xl bg-surface border border-border">
                        <summary className="text-sm font-medium text-primary cursor-pointer">
                            💡 Как создать хорошего персонажа
                        </summary>
                        <div className="mt-3 space-y-4 text-xs text-text-secondary">
                            <p>
                                <strong>Системный промпт</strong> — это инструкция для ИИ, описывающая персонажа.
                                Вы описываете того, с кем будете общаться, а не себя!
                            </p>


                            {/* Structure */}
                            <div className="p-3 rounded-lg bg-surface-light space-y-2">
                                <p className="font-semibold text-text-primary text-sm">📝 Структура хорошего промпта:</p>
                                <div className="space-y-2 text-text-muted text-xs">
                                    <div>
                                        <span className="font-medium text-primary">Характер</span> — опишите 5-7 черт личности.
                                        Добавьте скрытые качества, которые открываются не сразу!
                                    </div>
                                    <div>
                                        <span className="font-medium text-primary">Внешность</span> — как выглядит, особенности,
                                        узнаваемые детали (шрамы, татуировки, стиль одежды).
                                    </div>
                                    <div>
                                        <span className="font-medium text-primary">Предыстория</span> — что сформировало характер?
                                        Важные события, травмы, достижения.
                                    </div>
                                    <div>
                                        <span className="font-medium text-primary">Сценарий</span> — где и как начинается общение?
                                        Конкретное место и ситуация создают атмосферу.
                                    </div>
                                    <div>
                                        <span className="font-medium text-primary">Стиль речи</span> — как говорит: короткие фразы
                                        или длинные? Сленг, жаргон, акцент? Любимые словечки?
                                    </div>
                                </div>
                            </div>

                            {/* Character traits examples */}
                            <div className="p-3 rounded-lg bg-surface-light space-y-2">
                                <p className="font-semibold text-text-primary text-sm">🎭 Примеры черт характера:</p>
                                <div className="space-y-2 text-text-muted text-xs">
                                    <div>
                                        <p className="text-primary text-xs font-medium mb-1">Положительные:</p>
                                        <p>верный, заботливый, храбрый, честный, добрый, надёжный, терпеливый, щедрый, мудрый, веселый</p>
                                    </div>
                                    <div>
                                        <p className="text-primary text-xs font-medium mb-1">Сложные:</p>
                                        <p>саркастичный, упрямый, замкнутый, властный, ревнивый, циничный, гордый, импульсивный, мстительный</p>
                                    </div>
                                </div>
                            </div>

                            {/* Speech style examples */}
                            <div className="p-3 rounded-lg bg-surface-light space-y-2">
                                <p className="font-semibold text-text-primary text-sm">💬 Примеры стиля речи:</p>
                                <ul className="space-y-1 text-text-muted text-xs">
                                    <li>• <strong>Военный:</strong> короткие приказы, жаргон</li>
                                    <li>• <strong>Интеллигент:</strong> книжные выражения, сложные конструкции</li>
                                    <li>• <strong>Простой парень:</strong> просторечия, сленг, мат (если позволяет сеттинг)</li>
                                    <li>• <strong>Аристократ:</strong> витиеватые фразы, обращения</li>
                                </ul>
                            </div>

                            {/* Scenario examples */}
                            <div className="p-3 rounded-lg bg-surface-light space-y-2">
                                <p className="font-semibold text-text-primary text-sm">🎬 Примеры сценариев:</p>
                                <ul className="space-y-1 text-text-muted text-xs">
                                    <li>• Случайная встреча в кафе, баре, парке</li>
                                    <li>• Вы коллеги/соседи/одногруппники</li>
                                    <li>• Он/она спасает тебя от опасности</li>
                                    <li>• Ночь у костра после долгого дня</li>
                                    <li>• Ты новенький в его/её команде</li>
                                </ul>
                            </div>

                            {/* Secret sauce */}
                            <div className="p-3 rounded-lg bg-gradient-to-r from-primary/10 to-indigo-500/10 border border-primary/30 space-y-2">
                                <p className="font-semibold text-text-primary text-sm">✨ Секрет живого персонажа:</p>
                                <ul className="space-y-1 text-text-muted text-xs">
                                    <li>• <strong>Противоречия:</strong> "суровый снаружи, но заботливый внутри"</li>
                                    <li>• <strong>Скрытые черты:</strong> "втайне пишет стихи", "боится темноты"</li>
                                    <li>• <strong>Уникальные привычки:</strong> "постоянно крутит кольцо", "говорит с растениями"</li>
                                    <li>• <strong>Слабости:</strong> "не умеет отказывать", "слишком доверчив"</li>
                                </ul>
                            </div>
                        </div>
                    </details>
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

                {/* Private/Public Toggle */}
                <div className="p-4 rounded-xl bg-surface-light border border-border">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium text-text-primary">Личный персонаж</p>
                            <p className="text-xs text-text-muted mt-1">
                                Только вы будете видеть этого персонажа
                            </p>
                        </div>
                        {profile?.subscriptionStatus === 'active' ? (
                            <button
                                type="button"
                                onClick={() => setIsPrivate(!isPrivate)}
                                className={`relative w-12 h-7 rounded-full transition-colors ${isPrivate ? 'bg-primary' : 'bg-border'
                                    }`}
                            >
                                <span
                                    className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white transition-transform ${isPrivate ? 'translate-x-5' : ''
                                        }`}
                                />
                            </button>
                        ) : (
                            <span className="text-xs text-primary px-2 py-1 bg-primary/10 rounded-lg">
                                Premium
                            </span>
                        )}
                    </div>
                    {isPrivate && (
                        <p className="text-xs text-success mt-2">
                            ✓ Не требует модерации
                        </p>
                    )}
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
                                {model.isRecommended ? '⭐ ' : ''}{model.displayName}{model.isRecommended ? ' (рекоменд.)' : ''}
                            </option>
                        ))}
                    </select>
                    {availableModels.some(m => m.isRecommended) && (
                        <p className="mt-1 text-xs text-text-muted">⭐ — рекомендуемые модели для персонажей</p>
                    )}
                </div>

                {/* LLM Parameters */}
                <div className="space-y-4 p-4 rounded-xl bg-surface-light border border-border">
                    <h3 className="text-sm font-medium text-text-secondary">Параметры генерации (опционально). Менять только если понимаешь что делаешь.</h3>

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
                            <input type="range" min="-100" max="100" value={initialAttraction}
                                onChange={e => setInitialAttraction(Number(e.target.value))}
                                className="w-full accent-primary" />
                        </div>

                        <div>
                            <div className="flex justify-between text-xs text-text-muted mb-1">
                                <span>🤝 Доверие</span>
                                <span>{initialTrust}</span>
                            </div>
                            <input type="range" min="-100" max="100" value={initialTrust}
                                onChange={e => setInitialTrust(Number(e.target.value))}
                                className="w-full accent-primary" />
                        </div>

                        <div>
                            <div className="flex justify-between text-xs text-text-muted mb-1">
                                <span>💕 Привязанность</span>
                                <span>{initialAffection}</span>
                            </div>
                            <input type="range" min="-100" max="100" value={initialAffection}
                                onChange={e => setInitialAffection(Number(e.target.value))}
                                className="w-full accent-primary" />
                        </div>

                        <div>
                            <div className="flex justify-between text-xs text-text-muted mb-1">
                                <span>👑 Доминирование</span>
                                <span>{initialDominance}</span>
                            </div>
                            <input type="range" min="-100" max="100" value={initialDominance}
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
