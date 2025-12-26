import { useChatStore } from '../../store/chatStore';
import { useUserStore } from '../../store/userStore';
import { decline } from '../../utils/gender';

interface SessionInfoPanelProps {
    onClose: () => void;
}

const moodEmojis: Record<string, string> = {
    neutral: '😐',
    joyful: '😊',
    sad: '😢',
    angry: '😠',
    aroused: '😏',
    jealous: '😒',
    vulnerable: '🥺',
    playful: '😜',
    melancholic: '😔',
    tender: '🥰',
    passionate: '🔥',
    shy: '😳',
    curious: '🤔',
    flirty: '😘',
};

const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    });
};

// Normalize -50..+50 to 0..100% for display
const normalizeValue = (value: number) => Math.round(((value + 50) / 100) * 100);

// Get bar color based on value
const getBarColor = (value: number) => {
    if (value >= 30) return 'from-success to-emerald-400';
    if (value >= 10) return 'from-primary to-blue-400';
    if (value >= -10) return 'from-yellow-500 to-amber-400';
    return 'from-danger to-red-400';
};

const EmotionalBar = ({ label, value, emoji }: { label: string; value: number; emoji: string }) => {
    const percentage = normalizeValue(value);
    const colorClass = getBarColor(value);

    return (
        <div className="space-y-1">
            <div className="flex justify-between items-center text-xs">
                <span className="text-text-secondary">{emoji} {label}</span>
                <span className="text-text-muted">{value > 0 ? '+' : ''}{value}</span>
            </div>
            <div className="w-full h-2 bg-surface-light rounded-full overflow-hidden">
                <div
                    className={`h-full bg-gradient-to-r ${colorClass} transition-all duration-500`}
                    style={{ width: `${percentage}%` }}
                />
            </div>
        </div>
    );
};

export function SessionInfoPanel({ onClose }: SessionInfoPanelProps) {
    const { session, selectedCharacter, limits, memories, updateSessionSettings } = useChatStore();
    const { initData } = useUserStore();

    const handleModelUpdate = (model: string | null) => {
        if (selectedCharacter && initData) {
            updateSessionSettings(selectedCharacter.id, { llmModel: model }, initData);
        }
    };

    if (!session) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                <div className="w-full max-w-md p-6 rounded-2xl bg-surface/95 border border-border">
                    <p className="text-text-muted text-center">Загрузка данных сессии...</p>
                </div>
            </div>
        );
    }

    const emotionalState = session.emotionalState;
    const closeness = emotionalState.closeness;
    const moodLabel = emotionalState.moodLabel;
    const moodPrimary = emotionalState.mood.primary;
    const moodEmoji = moodEmojis[moodPrimary] || '😐';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-surface/95 border border-border overflow-hidden max-h-[85vh] overflow-y-auto">
                {/* Header */}
                <header className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-surface/95">
                    <h3 className="font-semibold text-lg">💕 Эмоциональное состояние</h3>
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-lg text-sm bg-surface-light border border-border text-text-secondary
                            hover:bg-surface hover:text-text-primary transition-colors"
                    >
                        Закрыть
                    </button>
                </header>

                {/* Content */}
                <div className="p-5 space-y-5">
                    {/* Character Name + Mood */}
                    <div className="text-center">
                        <h4 className="text-xl font-bold text-text-primary">{selectedCharacter?.name}</h4>
                        <div className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-surface-light/50 border border-border-light">
                            <span className="text-2xl">{moodEmoji}</span>
                            <span className="text-sm font-medium capitalize">{moodLabel}</span>
                        </div>
                    </div>

                    {/* Closeness (Main Bar) */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-text-secondary">❤️ Близость</span>
                            <span className="text-lg font-bold text-primary">{closeness}/50</span>
                        </div>
                        <div className="w-full h-4 bg-surface-light rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-pink-500 via-rose-400 to-red-400 transition-all duration-500"
                                style={{ width: `${(closeness / 50) * 100}%` }}
                            />
                        </div>
                    </div>

                    {/* Emotional Dimensions */}
                    {emotionalState && (
                        <div className="space-y-3 p-4 rounded-xl bg-surface-light/30 border border-border-light">
                            <h5 className="text-sm font-medium text-text-secondary mb-3">Измерения отношений</h5>
                            <EmotionalBar label="Влечение" value={emotionalState.attraction} emoji="💋" />
                            <EmotionalBar label="Доверие" value={emotionalState.trust} emoji="🤝" />
                            <EmotionalBar label="Нежность" value={emotionalState.affection} emoji="💝" />
                            <EmotionalBar label="Доминирование" value={emotionalState.dominance} emoji={emotionalState.dominance >= 0 ? '👑' : '🙇'} />
                            <p className="text-[10px] text-text-muted mt-2">
                                {emotionalState.dominance > 20
                                    ? `${decline(selectedCharacter?.grammaticalGender, 'Он доминирует', 'Она доминирует')}`
                                    : emotionalState.dominance < -20
                                        ? 'Вы ведёте'
                                        : 'Равные отношения'}
                            </p>
                        </div>
                    )}

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-surface-light/50 border border-border-light">
                            <p className="text-xs text-text-muted uppercase tracking-wide">Сообщений</p>
                            <p className="text-sm font-medium mt-1">💬 {session.messagesCount}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-surface-light/50 border border-border-light">
                            <p className="text-xs text-text-muted uppercase tracking-wide">Воспоминаний</p>
                            <p className="text-sm font-medium mt-1">🧠 {memories.length}</p>
                        </div>
                    </div>

                    {/* Timestamps */}
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between text-text-secondary">
                            <span>Последнее сообщение:</span>
                            <span className="text-text-primary">{formatDate(session.lastMessageAt)}</span>
                        </div>
                        <div className="flex justify-between text-text-secondary">
                            <span>Диалог начат:</span>
                            <span className="text-text-primary">{formatDate(session.createdAt)}</span>
                        </div>
                    </div>

                    {/* Limits */}
                    {limits && !limits.hasSubscription && (
                        <div className="p-3 rounded-xl bg-warning/10 border border-warning/30">
                            <p className="text-sm text-warning">
                                ⚡ Осталось сообщений: <strong>{limits.remaining}/{limits.total}</strong>
                            </p>
                        </div>
                    )}

                    {/* Model Settings */}
                    <div className="space-y-2 pt-2 border-t border-border">
                        <label className="text-sm text-text-secondary">Override LLM Model (optional)</label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="Default (Auto)"
                                defaultValue={session.llmModel || ''}
                                onBlur={(e) => {
                                    const val = e.target.value.trim() || null;
                                    if (val !== session.llmModel) {
                                        handleModelUpdate(val);
                                    }
                                }}
                                className="flex-1 px-3 py-2 rounded-xl bg-surface-light border border-border text-text-primary text-sm focus:outline-none focus:border-primary"
                            />
                        </div>
                        <p className="text-xs text-text-muted">
                            Укажите ID модели. Оставьте пустым для настроек персонажа.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
