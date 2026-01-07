import { useEffect, useState } from 'react';
import { useChatStore } from '../store/chatStore';
import { useUserStore } from '../store/userStore';
import { useNavigate } from 'react-router-dom';
import { SearchBar } from '../components/characters/SearchBar';
import { apiRequest } from '../lib/api';

interface Tag {
    id: number;
    name: string;
}

export function CharactersPage() {
    const { characters, loadCharacters, isLoadingCharacters, selectCharacter } = useChatStore();
    const { initData } = useUserStore();
    const navigate = useNavigate();

    const [search, setSearch] = useState('');
    const [selectedTags, setSelectedTags] = useState<number[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);

    // Load tags on mount
    useEffect(() => {
        if (initData) {
            apiRequest<{ tags: Tag[] }>('/api/tags', { initData })
                .then(data => setTags(data.tags))
                .catch(console.error);
        }
    }, [initData]);

    // Load characters when filters change
    useEffect(() => {
        if (initData) {
            loadCharacters(initData, { search, tags: selectedTags });
        }
    }, [initData, search, selectedTags]);

    const handleSelect = async (id: number) => {
        if (!initData) return;
        await selectCharacter(id, initData);
        navigate(`/chat/${id}`);
    };

    const toggleTag = (id: number) => {
        setSelectedTags(prev =>
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        );
    };

    return (
        <div className="min-h-screen p-4 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    Персонажи
                </h2>
            </div>

            <SearchBar onSearch={setSearch} />

            {/* Tags Filter Bar */}
            {tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                    {tags.map(tag => (
                        <button
                            key={tag.id}
                            onClick={() => toggleTag(tag.id)}
                            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all
                                ${selectedTags.includes(tag.id)
                                    ? 'bg-primary text-white shadow-lg shadow-primary/30'
                                    : 'bg-surface-light border border-border text-text-secondary hover:border-primary/40 hover:text-text-primary'
                                }`}
                        >
                            {tag.name}
                        </button>
                    ))}
                </div>
            )}

            {/* Characters Grid */}
            {isLoadingCharacters ? (
                <div className="flex items-center justify-center py-20">
                    <div className="text-text-secondary animate-pulse-slow">Загрузка персонажей...</div>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mt-6">
                    {characters.map(char => (
                        <div
                            key={char.id}
                            onClick={() => handleSelect(char.id)}
                            className="group cursor-pointer rounded-2xl overflow-hidden bg-surface-light border border-border
                                transition-all duration-300 hover:border-border-light hover:shadow-xl hover:shadow-primary/10
                                hover:-translate-y-1"
                        >
                            {/* Avatar */}
                            <div className="relative aspect-[3/4] overflow-hidden">
                                <img
                                    src={char.avatarUrl || '/placeholder.jpg'}
                                    alt={char.name}
                                    className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                                />
                                {char.accessType === 'premium' && (
                                    <span className="absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-medium
                                        bg-gradient-to-r from-purple-500/80 to-pink-500/80 backdrop-blur-sm">
                                        Premium
                                    </span>
                                )}
                            </div>
                            {/* Info */}
                            <div className="p-3">
                                <h3 className="font-semibold text-text-primary truncate">{char.name}</h3>
                                <p className="text-xs text-text-secondary line-clamp-4 mt-1">{char.description}</p>
                                {char.tags && char.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {char.tags.slice(0, 3).map((t, i) => (
                                            <span key={i} className="px-2 py-0.5 rounded-full text-[10px] bg-primary/20 text-primary">
                                                {t}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                    {characters.length === 0 && (
                        <div className="col-span-full text-center py-10 text-text-muted">
                            Персонажи не найдены
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
