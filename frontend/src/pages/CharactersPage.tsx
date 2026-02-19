import { useEffect, useState, useMemo } from 'react';
import { useChatStore, type Character } from '../store/chatStore';
import { useUserStore } from '../store/userStore';
import { useNavigate } from 'react-router-dom';
import { SearchBar } from '../components/characters/SearchBar';
import { apiRequest } from '../lib/api';
import { getCharacterAvatarUrl } from '../lib/imageUrl';
import { Icon } from '../components/Icon';

interface Tag {
    id: number;
    name: string;
}

interface CharacterCardProps {
    char: Character;
    tags: Tag[];
    selectedTags: number[];
    hasSubscription: boolean;
    onSelect: (id: number) => void;
    onTagClick: (id: number) => void;
}

function CharacterCard({ char, tags, selectedTags, hasSubscription, onSelect, onTagClick }: CharacterCardProps) {
    const isPremiumLocked = char.accessType === 'premium' && !hasSubscription;

    return (
        <div
            onClick={() => onSelect(char.id)}
            className={`group cursor-pointer rounded-2xl overflow-hidden bg-surface-light border border-border
                transition-all duration-300 hover:border-border-light hover:shadow-xl hover:shadow-primary/10
                hover:-translate-y-1 ${isPremiumLocked ? 'relative' : ''}`}
        >
            {/* Avatar */}
            <div className="relative aspect-[3/4] overflow-hidden">
                <img
                    src={getCharacterAvatarUrl(char.avatarUrl, char.grammaticalGender)}
                    alt={char.name}
                    className={`w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105
                        ${isPremiumLocked ? 'brightness-75' : ''}`}
                />
                {char.accessType === 'premium' && (
                    <span className={`absolute top-3 left-3 px-2 py-1 rounded-full text-xs font-medium
                        ${isPremiumLocked
                            ? 'bg-gradient-to-r from-amber-500/90 to-yellow-500/90 backdrop-blur-sm'
                            : 'bg-gradient-to-r from-purple-500/80 to-pink-500/80 backdrop-blur-sm'}`}>
                        {isPremiumLocked ? <><Icon name="lock" size={12} className="inline mr-1" /> Premium</> : <><Icon name="star" size={12} className="inline mr-1" /> Premium</>}
                    </span>
                )}
                {/* Lock overlay for non-subscribers */}
                {isPremiumLocked && (
                    <div className="absolute top-0 right-0 bottom-0 left-0 flex items-center justify-center bg-black/30">
                        <div className="text-center">
                            <span className="text-4xl"><Icon name="lock" size={36} /></span>
                        </div>
                    </div>
                )}
            </div>
            {/* Info */}
            <div className="p-3">
                <h3 className="font-semibold text-text-primary truncate">{char.name}</h3>
                <p className="text-xs text-text-secondary line-clamp-4 mt-1">{char.description}</p>
                {char.tags && char.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                        {char.tags.slice(0, 3).map((t, i) => (
                            <span
                                key={i}
                                className="px-2 py-0.5 rounded-full text-[10px] bg-primary/20 text-primary cursor-pointer hover:bg-primary/30 transition-colors"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const matchingTag = tags.find(tag => tag.name === t);
                                    if (matchingTag && !selectedTags.includes(matchingTag.id)) {
                                        onTagClick(matchingTag.id);
                                    }
                                }}
                            >
                                {t}
                            </span>
                        ))}
                    </div>
                )}
                {/* Likes count */}
                {(char.likesCount ?? 0) > 0 && (
                    <div className="flex items-center gap-1 mt-2 text-text-muted text-xs">
                        <span><Icon name="thumbs-up" size={14} /></span>
                        <span>{char.likesCount}</span>
                    </div>
                )}
            </div>
        </div>
    );
}

export function CharactersPage() {
    const { characters, myCharacterIds, loadCharacters, isLoadingCharacters } = useChatStore();
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

    // Split characters into "my" and "others"
    const { myCharacters, otherCharacters } = useMemo(() => {
        const mySet = new Set(myCharacterIds);
        const my: Character[] = [];
        const others: Character[] = [];

        // For "my characters" we want to preserve the order from myCharacterIds (sorted by last_message_at on backend)
        const charMap = new Map(characters.map(c => [c.id, c]));
        for (const id of myCharacterIds) {
            const char = charMap.get(id);
            if (char) my.push(char);
        }

        // Others are all characters not in myCharacterIds
        for (const char of characters) {
            if (!mySet.has(char.id)) {
                others.push(char);
            }
        }

        return { myCharacters: my, otherCharacters: others };
    }, [characters, myCharacterIds]);

    const handleSelect = (id: number) => {
        navigate(`/character/${id}`);
    };

    const toggleTag = (id: number) => {
        setSelectedTags(prev =>
            prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
        );
    };

    const { profile } = useUserStore();
    const hasSubscription = profile?.subscriptionStatus === 'active';

    const renderCharacterGrid = (chars: Character[]) => (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {chars.map(char => (
                <CharacterCard
                    key={char.id}
                    char={char}
                    tags={tags}
                    selectedTags={selectedTags}
                    hasSubscription={hasSubscription}
                    onSelect={handleSelect}
                    onTagClick={toggleTag}
                />
            ))}
        </div>
    );

    return (
        <div className="min-h-screen p-4 pb-20">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold bg-gradient-to-r from-white to-slate-300 bg-clip-text text-transparent">
                    Персонажи
                </h2>
                <button
                    onClick={() => navigate('/create-character')}
                    className="px-4 py-2 rounded-xl text-sm font-medium
                        bg-gradient-to-r from-primary to-indigo-500 text-white
                        hover:shadow-lg hover:shadow-primary/30 transition-all cursor-pointer"
                >
                    Создать персонажа
                </button>
            </div>

            <SearchBar onSearch={setSearch} />

            {/* Tags Filter Bar - 2 rows with horizontal scroll */}
            {tags.length > 0 && (
                <div className="mt-4 overflow-x-auto scrollbar-hide -mx-4 px-4">
                    <div className="flex flex-col gap-2 min-w-max">
                        <div className="flex gap-2">
                            {tags.filter((_, i) => i % 2 === 0).map(tag => (
                                <button
                                    key={tag.id}
                                    onClick={() => toggleTag(tag.id)}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer whitespace-nowrap
                                        ${selectedTags.includes(tag.id)
                                            ? 'bg-primary text-white shadow-lg shadow-primary/30'
                                            : 'bg-surface-light border border-border text-text-secondary hover:border-primary/40 hover:text-text-primary'
                                        }`}
                                >
                                    {tag.name}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            {tags.filter((_, i) => i % 2 === 1).map(tag => (
                                <button
                                    key={tag.id}
                                    onClick={() => toggleTag(tag.id)}
                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all cursor-pointer whitespace-nowrap
                                        ${selectedTags.includes(tag.id)
                                            ? 'bg-primary text-white shadow-lg shadow-primary/30'
                                            : 'bg-surface-light border border-border text-text-secondary hover:border-primary/40 hover:text-text-primary'
                                        }`}
                                >
                                    {tag.name}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Characters */}
            {isLoadingCharacters ? (
                <div className="flex items-center justify-center py-20">
                    <div className="text-text-secondary animate-pulse-slow">Загрузка персонажей...</div>
                </div>
            ) : (
                <div className="mt-6 space-y-8">
                    {/* My Characters Section */}
                    {myCharacters.length > 0 && (
                        <section>
                            <h3 className="text-lg font-semibold text-text-primary mb-4 flex items-center gap-2">
                                <span><Icon name="chat" size={18} /></span>
                                Мои персонажи
                            </h3>
                            {renderCharacterGrid(myCharacters)}
                        </section>
                    )}

                    {/* All Characters Section */}
                    {otherCharacters.length > 0 && (
                        <section>
                            {myCharacters.length > 0 && (
                                <h3 className="text-lg font-semibold text-text-primary mb-4">
                                    Все персонажи
                                </h3>
                            )}
                            {renderCharacterGrid(otherCharacters)}
                        </section>
                    )}

                    {characters.length === 0 && (
                        <div className="text-center py-10 text-text-muted">
                            Персонажи не найдены
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

