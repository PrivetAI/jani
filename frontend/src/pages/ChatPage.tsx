import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useChatStore } from '../store/chatStore';
import { useUserStore } from '../store/userStore';
import { MemoryViewer } from '../components/chat/MemoryViewer';
import { SessionInfoPanel } from '../components/chat/SessionInfoPanel';
import { LLMSettingsModal } from '../components/chat/LLMSettingsModal';
import { formatMessage } from '../utils/textFormatter';
import { getTypingStatus } from '../utils/gender';
import { getImageUrl, getCharacterAvatarUrl } from '../lib/imageUrl';

function Avatar({ src, name, isUser, gender }: { src?: string | null; name: string; isUser?: boolean; gender?: 'male' | 'female' }) {
    const initial = name?.charAt(0)?.toUpperCase() || '?';

    return (
        <div className={`w-12 h-12 rounded-xl flex-shrink-0 flex items-center justify-center text-lg font-medium
            ${isUser
                ? 'bg-gradient-to-br from-primary to-indigo-500 text-white'
                : 'bg-surface-light border border-border text-text-secondary'
            }`}
        >
            {src || (!isUser && gender) ? (
                <img src={isUser ? getImageUrl(src) : getCharacterAvatarUrl(src, gender)} alt={name} className="w-full h-full rounded-xl object-cover" />
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
        isRegenerating,
        regenerateLastMessage,
        resetChat,
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
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const handleDeleteChat = async () => {
        if (!initData) return;
        setIsDeleting(true);
        const success = await resetChat(characterId, initData);
        setIsDeleting(false);
        if (success) {
            setShowDeleteConfirm(false);
        }
    };

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
                        <div className="flex items-center gap-3 mt-1">
                            {limits.hasSubscription || limits.total === -1 ? (
                                <span className="text-sm text-primary font-medium">⚡ ∞</span>
                            ) : (
                                <>
                                    <span className="text-[11px] text-text-muted">
                                        ⚡ {limits.remaining}/{limits.total}
                                    </span>
                                    {profile?.bonusMessages !== undefined && profile.bonusMessages > 0 && (
                                        <span className="text-[11px] text-blue-400">
                                            ⚡ {profile.bonusMessages}
                                        </span>
                                    )}
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
                <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-10 h-10 flex items-center justify-center rounded-xl
                        bg-surface-light border border-border-light text-text-secondary
                        hover:bg-danger/20 hover:text-danger hover:border-danger/30 transition-colors"
                >
                    🔄
                </button>
            </header>

            {/* Session Info Modal */}
            {showSession && <SessionInfoPanel onClose={() => setShowSession(false)} />}

            {/* Memory Modal */}
            {showMemory && <MemoryViewer onClose={() => setShowMemory(false)} />}

            {/* LLM Settings Modal */}
            {showLLMSettings && <LLMSettingsModal onClose={() => setShowLLMSettings(false)} />}

            {/* Delete Confirmation Modal */}
            {showDeleteConfirm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <div className="w-full max-w-sm p-5 rounded-2xl bg-surface/95 border border-border space-y-4">
                        <h3 className="text-lg font-semibold text-center">Удалить диалог?</h3>
                        <p className="text-sm text-text-secondary text-center">
                            Вся история, память и отношения будут очищены. Это действие нельзя отменить.
                        </p>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setShowDeleteConfirm(false)}
                                disabled={isDeleting}
                                className="flex-1 py-2.5 rounded-xl text-sm
                                    bg-surface-light border border-border text-text-secondary
                                    hover:bg-surface transition-colors disabled:opacity-50"
                            >
                                Отмена
                            </button>
                            <button
                                onClick={handleDeleteChat}
                                disabled={isDeleting}
                                className="flex-1 py-2.5 rounded-xl text-sm font-medium
                                    bg-danger text-white
                                    hover:bg-danger/80 transition-colors disabled:opacity-50"
                            >
                                {isDeleting ? '...' : 'Удалить'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

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

                {/* Greeting message (shown when chat is empty, before user sends first message) */}
                {messages.length === 0 && !isLoadingMessages && selectedCharacter?.greetingMessage && (
                    <div className="flex gap-2 flex-row">
                        <Avatar
                            src={selectedCharacter.avatarUrl}
                            name={selectedCharacter.name}
                            gender={selectedCharacter.grammaticalGender}
                        />
                        <div className="flex flex-col items-start max-w-[85%]">
                            <span className="text-xs text-text-muted mb-1 px-4">
                                {selectedCharacter.name}
                            </span>
                            <div className="px-4 py-3 rounded-2xl rounded-bl-sm bg-surface border border-border leading-relaxed text-left">
                                {formatMessage(selectedCharacter.greetingMessage)}
                            </div>
                        </div>
                    </div>
                )}

                {messages.map((msg, index) => {
                    // Check if this is the last assistant message
                    const isLastAssistant = msg.role === 'assistant' &&
                        index === messages.length - 1 ||
                        (msg.role === 'assistant' && messages.slice(index + 1).every(m => m.role === 'user'));
                    const showRegenerate = isLastAssistant && !isSending && !isTyping && !isRegenerating;

                    return (
                        <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                            <Avatar
                                src={msg.role === 'user' ? null : selectedCharacter?.avatarUrl}
                                name={msg.role === 'user' ? userName : (selectedCharacter?.name || 'AI')}
                                isUser={msg.role === 'user'}
                                gender={msg.role === 'user' ? undefined : selectedCharacter?.grammaticalGender}
                            />
                            <div className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                                <span className="text-xs text-text-muted mb-1 px-4">
                                    {msg.role === 'user' ? userName : selectedCharacter?.name}
                                </span>
                                <div className={`px-4 py-3 rounded-2xl leading-relaxed text-left overflow-wrap-anywhere
                                    ${msg.role === 'user'
                                        ? 'bg-gradient-to-r from-primary/70 to-indigo-500/60 rounded-br-sm'
                                        : 'bg-surface border border-border rounded-bl-sm'
                                    } ${isRegenerating && isLastAssistant ? 'opacity-50' : ''}`}
                                >
                                    {formatMessage(msg.text)}
                                </div>
                                {showRegenerate && initData && (
                                    <div className="w-full flex justify-end mt-1">
                                        <button
                                            onClick={() => regenerateLastMessage(characterId, initData)}
                                            className="p-2 text-text-muted hover:text-primary 
                                                hover:bg-primary/10 rounded-lg transition-colors"
                                            title="Перегенерировать"
                                        >
                                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                                                <path d="M3 3v5h5" />
                                                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                                                <path d="M16 21h5v-5" />
                                            </svg>
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
                {(isSending || isTyping) && (
                    <div className="flex gap-2 flex-row">
                        <Avatar
                            src={selectedCharacter?.avatarUrl}
                            name={selectedCharacter?.name || 'AI'}
                            gender={selectedCharacter?.grammaticalGender}
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
                {limits && !limits.hasSubscription && limits.remaining === 0 && !(profile?.bonusMessages && profile.bonusMessages > 0) ? (
                    <div className="flex-1 flex flex-col items-center gap-1">
                        <button
                            onClick={() => navigate('/donate')}
                            className="w-full py-3 rounded-2xl bg-gradient-to-r from-primary to-indigo-500 text-white font-medium
                                hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                        >
                            ⚡ Получить сообщения
                        </button>
                        <span className="text-xs text-text-muted">или возвращайся завтра</span>
                    </div>
                ) : (
                    <>
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
                            placeholder={isSending || isRegenerating ? 'Подождите ответа...' : 'Напишите сообщение...'}
                            rows={1}
                            disabled={isSending || isRegenerating}
                            className={`flex-1 px-4 py-3 rounded-2xl bg-surface-light border border-border text-text-primary
                                placeholder:text-text-muted resize-none overflow-hidden focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20
                                ${isSending || isRegenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                            style={{ minHeight: '48px' }}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!inputText.trim() || isSending || isRegenerating}
                            className="w-12 h-12 flex-shrink-0 rounded-full flex items-center justify-center self-end
                                bg-gradient-to-r from-primary to-indigo-500 text-white text-lg
                                disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                        >
                            ➤
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}
