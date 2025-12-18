import { useEffect, useState } from 'react';
import { apiRequest } from '../../lib/api';
import { useUserStore } from '../../store/userStore';

export interface Tag {
    id: number;
    name: string;
    category: string;
}

interface CharacterFiltersProps {
    selectedTags: number[];
    onChangeTags: (tags: number[]) => void;
}

export function CharacterFilters({ selectedTags, onChangeTags }: CharacterFiltersProps) {
    const [tags, setTags] = useState<Tag[]>([]);
    const { initData } = useUserStore();

    useEffect(() => {
        if (initData) {
            apiRequest<{ tags: Tag[] }>('/api/tags', { initData })
                .then(data => setTags(data.tags))
                .catch(console.error);
        }
    }, [initData]);

    const toggleTag = (id: number) => {
        if (selectedTags.includes(id)) {
            onChangeTags(selectedTags.filter(t => t !== id));
        } else {
            onChangeTags([...selectedTags, id]);
        }
    };

    const categories = Array.from(new Set(tags.map(t => t.category)));

    return (
        <div className="space-y-4 p-4 rounded-xl bg-surface-light border border-border">
            {categories.map(cat => (
                <div key={cat}>
                    <h4 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                        {cat}
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {tags.filter(t => t.category === cat).map(tag => (
                            <button
                                key={tag.id}
                                onClick={() => toggleTag(tag.id)}
                                className={`px-3 py-1.5 rounded-lg text-sm transition-all
                                    ${selectedTags.includes(tag.id)
                                        ? 'bg-primary/30 text-primary border border-primary/40'
                                        : 'bg-surface border border-border text-text-secondary hover:bg-surface-light hover:text-text-primary'
                                    }`}
                            >
                                {tag.name}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
