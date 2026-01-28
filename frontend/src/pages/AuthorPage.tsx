import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUserStore } from '../store/userStore';
import { apiRequest } from '../lib/api';
import { getCharacterAvatarUrl } from '../lib/imageUrl';

interface AuthorInfo {
    id: number;
    name: string;
}

interface CharacterCard {
    id: number;
    name: string;
    description: string;
    avatarUrl?: string;
    accessType: 'free' | 'premium';
    tags: string[];
    likesCount: number;
    grammaticalGender?: 'male' | 'female';
}

export function AuthorPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const { initData } = useUserStore();

    const [author, setAuthor] = useState<AuthorInfo | null>(null);
    const [characters, setCharacters] = useState<CharacterCard[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!initData || !id) return;

        setLoading(true);
        apiRequest<{ author: AuthorInfo; characters: CharacterCard[] }>(`/api/authors/${id}`, { initData })
            .then(data => {
                setAuthor(data.author);
                setCharacters(data.characters);
                setError(null);
            })
            .catch(err => {
                setError(err.message || 'Ошибка загрузки');
            })
            .finally(() => setLoading(false));
    }, [initData, id]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-text-secondary animate-pulse-slow">Загрузка...</div>
            </div>
        );
    }

    if (error || !author) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="text-danger">{error || 'Автор не найден'}</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen pb-20">
            {/* Header */}
            <div className="px-4 py-4">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-2 text-text-secondary hover:text-text-primary transition-colors mb-4"
                >
                    <span className="text-lg">←</span>
                    <span>Назад</span>
                </button>

                <h1 className="text-2xl font-bold text-text-primary mb-1">
                    Персонажи от {author.name}
                </h1>
                <p className="text-text-muted">
                    {characters.length} {characters.length === 1 ? 'персонаж' :
                        characters.length < 5 ? 'персонажа' : 'персонажей'}
                </p>
            </div>

            {/* Characters Grid */}
            <div className="px-4">
                {characters.length === 0 ? (
                    <div className="text-center py-12 text-text-muted">
                        У этого автора пока нет персонажей
                    </div>
                ) : (
                    <div className="grid grid-cols-2 gap-4">
                        {characters.map(char => (
                            <div
                                key={char.id}
                                onClick={() => navigate(`/character/${char.id}`)}
                                className="bg-surface rounded-2xl overflow-hidden cursor-pointer
                                    hover:scale-[1.02] transition-transform active:scale-[0.98]"
                            >
                                <div className="aspect-square relative">
                                    <img
                                        src={getCharacterAvatarUrl(char.avatarUrl, char.grammaticalGender)}
                                        alt={char.name}
                                        className="w-full h-full object-cover"
                                    />
                                    {char.accessType === 'premium' && (
                                        <span className="absolute top-2 right-2 text-xs px-2 py-0.5 rounded-full
                                            bg-gradient-to-r from-purple-500/80 to-pink-500/80 backdrop-blur-sm">
                                            Premium
                                        </span>
                                    )}
                                </div>
                                <div className="p-3">
                                    <h3 className="font-semibold text-text-primary truncate">{char.name}</h3>
                                    <p className="text-xs text-text-muted line-clamp-2 mt-1">
                                        {char.description}
                                    </p>
                                    <div className="flex items-center gap-2 mt-2 text-xs text-text-muted">
                                        <span>👍 {char.likesCount}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
