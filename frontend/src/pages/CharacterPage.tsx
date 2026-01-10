import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { apiRequest } from '../lib/api';
import { getImageUrl } from '../lib/imageUrl';

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

export function CharacterPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { initData } = useUserStore();

    const [character, setCharacter] = useState<CharacterDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [ratingLoading, setRatingLoading] = useState(false);

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

    const handleRate = async (rating: 1 | -1 | null) => {
        if (!initData || !id || ratingLoading) return;

        // Toggle logic: если уже лайк/дизлайк, то убираем
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
            {/* Back button - above image */}
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
                <div className="aspect-[4/5] max-h-[60vh] overflow-hidden">
                    <img
                        src={getImageUrl(character.avatarUrl)}
                        alt={character.name}
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
                </div>

                {/* Premium badge */}
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

                {/* Author */}
                <p className="text-sm text-text-muted mb-4">
                    Автор: <span className="text-text-secondary">{character.createdBy.name}</span>
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
                <p className="text-text-secondary leading-relaxed mb-6 text-[15px] italic"
                    style={{ fontFamily: "'Merriweather', Georgia, serif" }}>
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
            </div>
        </div>
    );
}
