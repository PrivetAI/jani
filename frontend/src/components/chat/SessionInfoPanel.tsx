import { useChatStore, type Session } from '../../store/chatStore';

interface SessionInfoPanelProps {
    onClose: () => void;
}

const relationshipLabels: Record<Session['relationship'], string> = {
    neutral: '🤝 Знакомые',
    friend: '😊 Друзья',
    partner: '💕 Партнёры',
    colleague: '💼 Коллеги',
    mentor: '🎓 Наставник',
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

export function SessionInfoPanel({ onClose }: SessionInfoPanelProps) {
    const { session, selectedCharacter, limits, memories } = useChatStore();

    if (!session) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                <div className="w-full max-w-md p-6 rounded-2xl bg-surface/95 border border-border">
                    <p className="text-text-muted text-center">Загрузка данных сессии...</p>
                </div>
            </div>
        );
    }

    const scoreColor = session.relationshipScore >= 70
        ? 'text-success'
        : session.relationshipScore >= 40
            ? 'text-warning'
            : 'text-danger';

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl bg-surface/95 border border-border overflow-hidden">
                {/* Header */}
                <header className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h3 className="font-semibold text-lg">📊 Статус диалога</h3>
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
                    {/* Character Name */}
                    <div className="text-center">
                        <h4 className="text-xl font-bold text-text-primary">{selectedCharacter?.name}</h4>
                        <p className="text-sm text-text-muted mt-1">{selectedCharacter?.description}</p>
                    </div>

                    {/* Relationship Score Bar */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <span className="text-sm text-text-secondary">Уровень отношений</span>
                            <span className={`text-lg font-bold ${scoreColor}`}>{session.relationshipScore}/100</span>
                        </div>
                        <div className="w-full h-3 bg-surface-light rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-primary to-success transition-all duration-500"
                                style={{ width: `${session.relationshipScore}%` }}
                            />
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 rounded-xl bg-surface-light/50 border border-border-light">
                            <p className="text-xs text-text-muted uppercase tracking-wide">Отношения</p>
                            <p className="text-sm font-medium mt-1">{relationshipLabels[session.relationship]}</p>
                        </div>
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
                </div>
            </div>
        </div>
    );
}
