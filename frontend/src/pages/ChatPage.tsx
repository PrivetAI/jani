import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { useUserStore } from '../store/userStore';
import { MemoryViewer } from '../components/chat/MemoryViewer';
import { SessionInfoPanel } from '../components/chat/SessionInfoPanel';
import { formatMessage } from '../utils/textFormatter';

export function ChatPage() {
    const { id } = useParams<{ id: string }>();
    const characterId = Number(id);
    const navigate = useNavigate();

    const {
        messages,
        sendMessage,
        selectedCharacter,
        selectCharacter,
        loadLimits,
        loadSession,
        limits,
        isLoadingMessages,
        isSending,
        isTyping,
        initSocket,
        disconnectSocket
    } = useChatStore();

    const { initData } = useUserStore();
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const [showMemory, setShowMemory] = useState(false);
    const [showSession, setShowSession] = useState(false);

    // Initialize socket on mount, cleanup on unmount
    useEffect(() => {
        if (initData) {
            initSocket(initData);
        }
        return () => {
            disconnectSocket();
        };
    }, [initData]);

    useEffect(() => {
        if (initData && characterId) {
            // Always select character first (this loads messages too)
            selectCharacter(characterId, initData);
            loadLimits(initData);
            loadSession(characterId, initData);
        }
    }, [characterId, initData]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleSend = () => {
        if (!inputText.trim() || !initData) return;
        const text = inputText;
        setInputText('');
        sendMessage(characterId, text, initData);
        loadLimits(initData);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    if (isLoadingMessages && messages.length === 0) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-text-secondary animate-pulse-slow">Загрузка чата...</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-background">
            {/* Header */}
            <header className="flex items-center gap-3 px-4 py-3 bg-surface/90 backdrop-blur-xl border-b border-border">
                <button
                    onClick={() => navigate('/characters')}
                    className="w-10 h-10 flex items-center justify-center rounded-xl 
                        bg-surface-light border border-border-light text-text-secondary
                        hover:bg-surface hover:text-text-primary transition-colors"
                >
                    ←
                </button>
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold truncate">{selectedCharacter?.name || 'Чат'}</h3>
                    {limits && (
                        <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1 max-w-24 bg-border rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-success to-emerald-400 rounded-full transition-all"
                                    style={{ width: `${(limits.remaining / limits.total) * 100}%` }}
                                />
                            </div>
                            <span className="text-[11px] text-text-muted">{limits.remaining}/{limits.total}</span>
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setShowSession(true)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl
                        bg-surface-light border border-border-light text-text-secondary
                        hover:bg-primary/20 hover:text-primary hover:border-primary/30 transition-colors"
                >
                    📊
                </button>
                <button
                    onClick={() => setShowMemory(true)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl
                        bg-surface-light border border-border-light text-text-secondary
                        hover:bg-primary/20 hover:text-primary hover:border-primary/30 transition-colors"
                >
                    🧠
                </button>
            </header>

            {/* Session Info Modal */}
            {showSession && <SessionInfoPanel onClose={() => setShowSession(false)} />}

            {/* Memory Modal */}
            {showMemory && <MemoryViewer onClose={() => setShowMemory(false)} />}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messages.map(msg => (
                    <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] px-4 py-3 rounded-2xl leading-relaxed
                            ${msg.role === 'user'
                                ? 'bg-gradient-to-r from-primary/70 to-indigo-500/60 rounded-br-sm'
                                : 'bg-surface border border-border rounded-bl-sm'
                            }`}
                        >
                            {formatMessage(msg.text)}

                        </div>
                    </div>
                ))}
                {isSending && (
                    <div className="flex justify-start">
                        <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-surface border border-border animate-pulse-slow">
                            {isTyping ? '✍️ печатает...' : '...'}
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex gap-3 p-4 bg-surface/90 backdrop-blur-xl border-t border-border">
                <textarea
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Напишите сообщение..."
                    rows={1}
                    className="flex-1 px-4 py-3 rounded-2xl bg-surface-light border border-border text-text-primary
                        placeholder:text-text-muted resize-none focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
                />
                <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || isSending}
                    className="w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center
                        bg-gradient-to-r from-primary to-indigo-500 text-white text-lg
                        disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                    ➤
                </button>
            </div>
        </div>
    );
}
