import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { apiRequest } from '../lib/api';
import { getCharacterAvatarUrl } from '../lib/imageUrl';

interface CharacterDetail {
    id: number;
    name: string;
    description: string;
    avatarUrl?: string;
    accessType: 'free' | 'premium';
    grammaticalGender?: 'male' | 'female';
    tags?: string[];
    likesCount: number;
    dislikesCount: number;
    userRating: 1 | -1 | null;
    createdBy: { id: number; name: string };
}

interface Comment {
    id: number;
    content: string;
    createdAt: string;
    author: { id: number; name: string };
    isOwn: boolean;
    replies: Comment[];
}

export function CharacterPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { initData } = useUserStore();

    const [character, setCharacter] = useState<CharacterDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ratingLoading, setRatingLoading] = useState(false);

    // Comments state
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [newComment, setNewComment] = useState('');
    const [replyTo, setReplyTo] = useState<number | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [shareLoading, setShareLoading] = useState(false);
    const [shareCopied, setShareCopied] = useState(false);

    useEffect(() => {
        if (!initData || !id) return;

        setLoading(true);
        apiRequest<{ character: CharacterDetail }>(`/api/characters/${id}`, { initData })
            .then(data => {
                setCharacter(data.character);
                setError(null);
            })
            .catch(err => {
                setError(err.message || 'Ошибка загрузки');
            })
            .finally(() => setLoading(false));
    }, [initData, id]);

    // Load comments
    useEffect(() => {
        if (!initData || !id) return;

        setCommentsLoading(true);
        apiRequest<{ comments: Comment[] }>(`/api/characters/${id}/comments`, { initData })
            .then(data => setComments(data.comments))
            .catch(console.error)
            .finally(() => setCommentsLoading(false));
    }, [initData, id]);

    const handleRate = async (rating: 1 | -1 | null) => {
        if (!initData || !id || ratingLoading) return;
        const newRating = character?.userRating === rating ? null : rating;

        setRatingLoading(true);
        try {
            const result = await apiRequest<{ userRating: 1 | -1 | null; likesCount: number; dislikesCount: number }>(
                `/api/characters/${id}/rate`,
                { method: 'POST', body: { rating: newRating }, initData }
            );
            setCharacter(prev => prev ? {
                ...prev,
                userRating: result.userRating,
                likesCount: result.likesCount,
                dislikesCount: result.dislikesCount,
            } : null);
        } catch (err) {
            console.error('Rating error:', err);
        } finally {
            setRatingLoading(false);
        }
    };

    const handleStartChat = () => {
        navigate(`/chat/${id}`);
    };

    const handleShare = async () => {
        if (!initData || !id || shareLoading) return;

        setShareLoading(true);
        try {
            const result = await apiRequest<{ deeplink: string; shareText: string }>(`/api/characters/${id}/deeplink`, { initData });

            // Always copy to clipboard
            await navigator.clipboard.writeText(result.deeplink);
            setShareCopied(true);
            setTimeout(() => setShareCopied(false), 2000);
        } catch (err) {
            console.error('Share error:', err);
        } finally {
            setShareLoading(false);
        }
    };

    const handleSubmitComment = async () => {
        if (!initData || !id || !newComment.trim() || submitting) return;

        setSubmitting(true);
        try {
            await apiRequest(`/api/characters/${id}/comments`, {
                method: 'POST',
                body: { content: newComment.trim(), parentId: replyTo },
                initData
            });
            setNewComment('');
            setReplyTo(null);
            // Reload comments
            const data = await apiRequest<{ comments: Comment[] }>(`/api/characters/${id}/comments`, { initData });
            setComments(data.comments);
        } catch (err) {
            console.error('Comment error:', err);
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteComment = async (commentId: number) => {
        if (!initData) return;
        try {
            await apiRequest(`/api/comments/${commentId}`, { method: 'DELETE', initData });
            // Reload comments
            const data = await apiRequest<{ comments: Comment[] }>(`/api/characters/${id}/comments`, { initData });
            setComments(data.comments);
        } catch (err) {
            console.error('Delete error:', err);
        }
    };

    const renderComment = (comment: Comment, depth = 0) => (
        <div key={comment.id} className={`${depth > 0 ? 'ml-6 border-l-2 border-border pl-4' : ''}`}>
            <div className="py-3">
                <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-text-primary">{comment.author.name}</span>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-text-muted">
                            {new Date(comment.createdAt).toLocaleDateString('ru')}
                        </span>
                        {comment.isOwn && (
                            <button
                                onClick={() => handleDeleteComment(comment.id)}
                                className="text-xs text-danger hover:underline"
                            >
                                Удалить
                            </button>
                        )}
                    </div>
                </div>
                <p className="text-text-secondary text-sm mb-2">{comment.content}</p>
                <button
                    onClick={() => setReplyTo(replyTo === comment.id ? null : comment.id)}
                    className="text-xs text-primary hover:underline"
                >
                    {replyTo === comment.id ? 'Отмена' : 'Ответить'}
                </button>
                {replyTo === comment.id && (
                    <div className="mt-2 flex gap-2">
                        <input
                            type="text"
                            value={newComment}
                            onChange={e => setNewComment(e.target.value)}
                            placeholder="Ваш ответ..."
                            className="flex-1 px-3 py-2 rounded-lg bg-surface-light border border-border text-sm"
                        />
                        <button
                            onClick={handleSubmitComment}
                            disabled={!newComment.trim() || submitting}
                            className="px-4 py-2 bg-primary text-white rounded-lg text-sm disabled:opacity-50"
                        >
                            →
                        </button>
                    </div>
                )}
            </div>
            {comment.replies.map(reply => renderComment(reply, depth + 1))}
        </div>
    );

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-text-secondary animate-pulse-slow">Загрузка...</div>
            </div>
        );
    }

    if (error || !character) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-danger">{error || 'Персонаж не найден'}</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-20">
            {/* Back button */}
            <div className="px-4 py-3">
                <button
                    onClick={() => navigate('/characters')}
                    className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors"
                >
                    <span className="text-lg">←</span>
                    <span>Назад</span>
                </button>
            </div>

            {/* Hero Section */}
            <div className="relative">
                <div className="aspect-[4/4] max-h-[48vh] overflow-hidden">
                    <img
                        src={getCharacterAvatarUrl(character.avatarUrl, character.grammaticalGender)}
                        alt={character.name}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
                </div>

                {character.accessType === 'premium' && (
                    <span className="absolute top-4 right-4 px-3 py-1.5 rounded-full text-sm font-medium
                        bg-gradient-to-r from-purple-500/80 to-pink-500/80 backdrop-blur-sm">
                        Premium
                    </span>
                )}
            </div>

            {/* Content */}
            <div className="px-4 -mt-20 relative z-10">
                <h1 className="text-3xl font-bold text-text-primary mb-2">{character.name}</h1>

                {/* Author - clickable link */}
                <p className="text-sm text-text-muted mb-4">
                    Автор:{' '}
                    <Link
                        to={`/author/${character.createdBy.id}`}
                        className="text-primary hover:underline"
                    >
                        {character.createdBy.name}
                    </Link>
                </p>

                {/* Tags */}
                {character.tags && character.tags.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-4">
                        {character.tags.map((tag, i) => (
                            <span
                                key={i}
                                className="px-3 py-1 rounded-full text-sm bg-primary/20 text-primary"
                            >
                                {tag}
                            </span>
                        ))}
                    </div>
                )}

                {/* Description */}
                <p className="text-text-secondary leading-relaxed mb-6">
                    {character.description}
                </p>

                {/* Rating buttons */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={() => handleRate(1)}
                        disabled={ratingLoading}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all
                            ${character.userRating === 1
                                ? 'bg-success/20 text-success border border-success/50'
                                : 'bg-surface-light border border-border text-text-secondary hover:border-success/50 hover:text-success'
                            } disabled:opacity-50`}
                    >
                        <span className="text-lg">👍</span>
                        <span className="font-medium">{character.likesCount}</span>
                    </button>

                    <button
                        onClick={() => handleRate(-1)}
                        disabled={ratingLoading}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl transition-all
                            ${character.userRating === -1
                                ? 'bg-danger/20 text-danger border border-danger/50'
                                : 'bg-surface-light border border-border text-text-secondary hover:border-danger/50 hover:text-danger'
                            } disabled:opacity-50`}
                    >
                        <span className="text-lg">👎</span>
                        <span className="font-medium">{character.dislikesCount}</span>
                    </button>

                    {/* Share button */}
                    <button
                        onClick={handleShare}
                        disabled={shareLoading}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl transition-all
                            bg-surface-light border border-border text-text-secondary 
                            hover:border-primary/50 hover:text-primary disabled:opacity-50 ml-auto"
                    >
                        {shareCopied ? (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="20 6 9 17 4 12" />
                            </svg>
                        ) : (
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                                <polyline points="16 6 12 2 8 6" />
                                <line x1="12" y1="2" x2="12" y2="15" />
                            </svg>
                        )}
                        <span className="font-medium">{shareCopied ? 'Скопировано!' : 'Поделиться'}</span>
                    </button>
                </div>

                {/* Start chat button */}
                <button
                    onClick={handleStartChat}
                    className="w-full py-4 rounded-2xl font-semibold text-white
                        bg-gradient-to-r from-primary to-indigo-500 
                        hover:shadow-lg hover:shadow-primary/30 transition-all
                        active:scale-[0.98]"
                >
                    Начать чат с {character.name}
                </button>

                {/* Comments Section */}
                <div className="mt-8">
                    <h2 className="text-xl font-bold text-text-primary mb-4">
                        Комментарии {comments.length > 0 && `(${comments.length})`}
                    </h2>

                    {/* New comment form */}
                    {replyTo === null && (
                        <div className="flex gap-2 mb-6">
                            <input
                                type="text"
                                value={newComment}
                                onChange={e => setNewComment(e.target.value)}
                                placeholder="Написать комментарий..."
                                className="flex-1 px-4 py-3 rounded-xl bg-surface-light border border-border
                                    focus:border-primary focus:outline-none transition-colors"
                            />
                            <button
                                onClick={handleSubmitComment}
                                disabled={!newComment.trim() || submitting}
                                className="px-6 py-3 bg-primary text-white rounded-xl font-medium
                                    disabled:opacity-50 transition-opacity"
                            >
                                {submitting ? '...' : '→'}
                            </button>
                        </div>
                    )}

                    {/* Comments list */}
                    {commentsLoading ? (
                        <div className="text-text-muted text-center py-4">Загрузка...</div>
                    ) : comments.length === 0 ? (
                        <div className="text-text-muted text-center py-4">Пока нет комментариев</div>
                    ) : (
                        <div className="divide-y divide-border">
                            {comments.map(comment => renderComment(comment))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

