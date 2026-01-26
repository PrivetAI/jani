import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { useUserStore } from '../store/userStore';
import { MemoryViewer } from '../components/chat/MemoryViewer';
import { SessionInfoPanel } from '../components/chat/SessionInfoPanel';
import { LLMSettingsModal } from '../components/chat/LLMSettingsModal';
import { formatMessage } from '../utils/textFormatter';
import { getTypingStatus } from '../utils/gender';
import { getImageUrl } from '../lib/imageUrl';

function Avatar({ src, name, isUser }: { src?: string | null; name: string; isUser?: boolean }) {
    const initial = name?.charAt(0)?.toUpperCase() || '?';

    return (
        <div className={`w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-lg font-medium
            ${isUser
                ? 'bg-gradient-to-br from-primary to-indigo-500 text-white'
                : 'bg-surface-light border border-border text-text-secondary'
            }`}
        >
            {src ? (
                <img src={getImageUrl(src)} alt={name} className="w-full h-full rounded-xl object-cover" />
            ) : (
                initial
            )}
        </div>
    );
}

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
        loadMoreMessages,
        limits,
        isLoadingMessages,
        isLoadingMoreMessages,
        hasMoreMessages,
        isSending,
        isTyping,
        error,
        initSocket,
        disconnectSocket
    } = useChatStore();

    const { initData, profile } = useUserStore();
    const userName = profile?.displayName || profile?.nickname || 'Вы';
    const [inputText, setInputText] = useState('');
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const messagesContainerRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [showMemory, setShowMemory] = useState(false);
    const [showSession, setShowSession] = useState(false);
    const [showLLMSettings, setShowLLMSettings] = useState(false);

    // Handle scroll for infinite scroll (load older messages)
    const handleScroll = () => {
        const container = messagesContainerRef.current;
        if (!container || isLoadingMoreMessages || !hasMoreMessages || !initData) return;

        // Load more when scrolled near top (within 100px)
        if (container.scrollTop < 100) {
            loadMoreMessages(characterId, initData);
        }
    };

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
        // Reset textarea height
        if (textareaRef.current) {
            textareaRef.current.style.height = '48px';
        }
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
                            <span className="text-[11px]">⚡</span>
                            {limits.hasSubscription || limits.total === -1 ? (
                                <span className="text-[11px] text-primary font-medium">∞</span>
                            ) : (
                                <>
                                    <div className="flex-1 h-1 max-w-24 bg-border rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-success to-emerald-400 rounded-full transition-all"
                                            style={{ width: `${(limits.remaining / limits.total) * 100}%` }}
                                        />
                                    </div>
                                    <span className="text-[11px] text-text-muted">{limits.remaining}/{limits.total}</span>
                                </>
                            )}
                        </div>
                    )}
                </div>
                <button
                    onClick={() => setShowLLMSettings(true)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl
                        bg-surface-light border border-border-light text-text-secondary
                        hover:bg-primary/20 hover:text-primary hover:border-primary/30 transition-colors"
                >
                    ⚙️
                </button>
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

            {/* LLM Settings Modal */}
            {showLLMSettings && <LLMSettingsModal onClose={() => setShowLLMSettings(false)} />}

            {/* Messages */}
            <div
                ref={messagesContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto p-4 space-y-4"
            >
                {/* Loading older messages indicator */}
                {isLoadingMoreMessages && (
                    <div className="text-center py-2">
                        <span className="text-text-muted text-sm animate-pulse">Загрузка...</span>
                    </div>
                )}
                {hasMoreMessages && !isLoadingMoreMessages && (
                    <div className="text-center py-2">
                        <span className="text-text-muted text-xs">↑ Прокрутите вверх для загрузки</span>
                    </div>
                )}
                {messages.map(msg => (
                    <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        <Avatar
                            src={msg.role === 'user' ? null : selectedCharacter?.avatarUrl}
                            name={msg.role === 'user' ? userName : (selectedCharacter?.name || 'AI')}
                            isUser={msg.role === 'user'}
                        />
                        <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                            <span className="text-xs text-text-muted mb-1 px-4">
                                {msg.role === 'user' ? userName : selectedCharacter?.name}
                            </span>
                            <div className={`px-4 py-3 rounded-2xl leading-relaxed text-left overflow-wrap-anywhere
                                ${msg.role === 'user'
                                    ? 'bg-gradient-to-r from-primary/70 to-indigo-500/60 rounded-br-sm'
                                    : 'bg-surface border border-border rounded-bl-sm'
                                }`}
                            >
                                {formatMessage(msg.text)}
                            </div>
                        </div>
                    </div>
                ))}
                {(isSending || isTyping) && (
                    <div className="flex gap-2 flex-row">
                        <Avatar
                            src={selectedCharacter?.avatarUrl}
                            name={selectedCharacter?.name || 'AI'}
                        />
                        <div className="flex flex-col items-start">
                            <span className="text-xs text-text-muted mb-1 px-1">
                                {selectedCharacter?.name}
                            </span>
                            <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-surface border border-border animate-pulse-slow">
                                {isTyping ? getTypingStatus(selectedCharacter?.grammaticalGender) : '...'}
                            </div>
                        </div>
                    </div>
                )}
                {error && !isSending && !isTyping && (
                    <div className="flex justify-center py-2">
                        <div className="px-4 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-400 text-sm">
                            ⚠️ {error}
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="flex gap-3 px-4 pt-4 pb-5 bg-surface/90 backdrop-blur-xl border-t border-border">
                <textarea
                    ref={textareaRef}
                    inputMode="text"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    enterKeyHint="send"
                    value={inputText}
                    onChange={e => {
                        setInputText(e.target.value);
                        // Auto-grow textarea
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 144) + 'px'; // max 6 lines (~144px)
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={isSending ? 'Подождите ответа...' : 'Напишите сообщение...'}
                    rows={1}
                    disabled={isSending}
                    className={`flex-1 px-4 py-3 rounded-2xl bg-surface-light border border-border text-text-primary
                        placeholder:text-text-muted resize-none overflow-hidden focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20
                        ${isSending ? 'opacity-50 cursor-not-allowed' : ''}`}
                    style={{ minHeight: '48px' }}
                />
                <button
                    onClick={handleSend}
                    disabled={!inputText.trim() || isSending}
                    className="w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center self-end
                        bg-gradient-to-r from-primary to-indigo-500 text-white text-lg
                        disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                >
                    ➤
                </button>
            </div>
        </div>
    );
}
