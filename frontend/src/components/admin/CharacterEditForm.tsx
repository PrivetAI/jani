import { useState } from 'react';
import type { LLMModel, Character } from './types';

interface Tag {
    id: number;
    name: string;
}

interface CharacterEditFormProps {
    editForm: Partial<Character>;
    setEditForm: (form: Partial<Character>) => void;
    models: LLMModel[];
    loadingModels: boolean;
    onSave: () => void;
    onCancel: () => void;
    validationError?: string | null;
    availableTags: Tag[];
}

export function CharacterEditForm({
    editForm,
    setEditForm,
    models,
    loadingModels,
    onSave,
    onCancel,
    validationError,
    availableTags,
}: CharacterEditFormProps) {
    const inputClass = "w-full px-3 py-2 rounded-lg bg-surface border border-border text-text-primary text-sm focus:outline-none focus:border-primary/50";
    const labelClass = "block text-xs text-text-muted mb-1";

    const showModelsDropdown = editForm.llmProvider && ['gemini', 'openai', 'openrouter'].includes(editForm.llmProvider);

    const [modelSearch, setModelSearch] = useState('');
    const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);

    const filteredModels = models.filter(m =>
        m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
        m.id.toLowerCase().includes(modelSearch.toLowerCase())
    );

    const selectedModelName = models.find(m => m.id === editForm.llmModel)?.name || editForm.llmModel || '';

    const handleModelSelect = (modelId: string) => {
        setEditForm({ ...editForm, llmModel: modelId || null });
        setModelSearch('');
        setIsModelDropdownOpen(false);
    };

    return (
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

                {/* Tags Settings */}
                <div className="border-t border-border pt-4 mt-4">
                    <h4 className="text-xs font-semibold text-primary mb-3">🏷️ Теги</h4>
                    <div className="flex flex-wrap gap-2">
                        {availableTags.map(tag => {
                            const isSelected = editForm.tagIds?.includes(tag.id) ?? false;
                            return (
                                <button
                                    key={tag.id}
                                    type="button"
                                    onClick={() => {
                                        const current = editForm.tagIds || [];
                                        const updated = isSelected
                                            ? current.filter(id => id !== tag.id)
                                            : [...current, tag.id];
                                        setEditForm({ ...editForm, tagIds: updated });
                                    }}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all
                                        ${isSelected
                                            ? 'bg-primary text-white'
                                            : 'bg-surface border border-border text-text-secondary hover:border-primary/40'
                                        }`}
                                >
                                    {tag.name}
                                </button>
                            );
                        })}
                        {availableTags.length === 0 && (
                            <span className="text-text-muted text-sm">Нет доступных тегов</span>
                        )}
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
                        <label className={labelClass}>Provider *</label>
                        <select
                            value={editForm.llmProvider || ''}
                            onChange={e => setEditForm({ ...editForm, llmProvider: (e.target.value as any) || null, llmModel: null })}
                            className={inputClass + " w-full sm:w-1/2" + (!editForm.llmProvider ? " border-red-500/50" : "")}
                        >
                            <option value="">Выберите провайдера</option>
                            <option value="openrouter">OpenRouter</option>
                            <option value="gemini">Gemini</option>
                            <option value="openai">OpenAI</option>
                        </select>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="relative">
                            <label className={labelClass}>Model *</label>
                            {showModelsDropdown ? (
                                <div className="relative">
                                    <input
                                        type="text"
                                        value={isModelDropdownOpen ? modelSearch : selectedModelName}
                                        onChange={e => {
                                            setModelSearch(e.target.value);
                                            if (!isModelDropdownOpen) setIsModelDropdownOpen(true);
                                        }}
                                        onFocus={() => setIsModelDropdownOpen(true)}
                                        onBlur={() => setTimeout(() => setIsModelDropdownOpen(false), 150)}
                                        className={inputClass + (!editForm.llmModel ? " border-red-500/50" : "")}
                                        placeholder={loadingModels ? 'Загрузка...' : 'Найти модель...'}
                                        disabled={loadingModels}
                                    />
                                    {isModelDropdownOpen && !loadingModels && (
                                        <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto rounded-lg bg-slate-900 border border-border shadow-lg">
                                            {filteredModels.length === 0 ? (
                                                <div className="px-3 py-2 text-sm text-text-muted">Не найдено</div>
                                            ) : (
                                                filteredModels.map(m => (
                                                    <button
                                                        key={m.id}
                                                        type="button"
                                                        onMouseDown={() => handleModelSelect(m.id)}
                                                        className={`w-full px-3 py-2 text-left text-sm hover:bg-primary/20 ${editForm.llmModel === m.id ? 'bg-primary/10 text-primary' : 'text-text-primary'
                                                            }`}
                                                    >
                                                        {m.name}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <input
                                    value={editForm.llmModel || ''}
                                    onChange={e => setEditForm({ ...editForm, llmModel: e.target.value || null })}
                                    className={inputClass + (!editForm.llmModel ? " border-red-500/50" : "")}
                                    placeholder="Введите модель"
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

                {/* Validation Error */}
                {validationError && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                        {validationError}
                    </div>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                    <button
                        onClick={onSave}
                        className="flex-1 py-2.5 rounded-xl font-medium text-white bg-gradient-to-r from-primary to-indigo-500"
                    >
                        Сохранить
                    </button>
                    <button
                        onClick={onCancel}
                        className="flex-1 py-2.5 rounded-xl font-medium bg-surface border border-border text-text-secondary hover:text-text-primary"
                    >
                        Отмена
                    </button>
                </div>
            </div>
        </div>
    );
}

