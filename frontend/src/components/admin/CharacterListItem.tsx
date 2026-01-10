import type { Character } from './types';
import { getImageUrl } from '../../lib/imageUrl';

interface CharacterListItemProps {
    character: Character;
    onEdit: (character: Character) => void;
}

export function CharacterListItem({ character, onEdit }: CharacterListItemProps) {
    return (
        <div className="flex items-center gap-3 flex-wrap">
            <div className="h-10 w-10 rounded-full overflow-hidden bg-surface-light border border-border shrink-0">
                <img
                    src={getImageUrl(character.avatarUrl)}
                    alt={character.name}
                    className="w-full h-full object-cover"
                />
            </div>
            <span className="font-semibold text-text-primary">{character.name}</span>
            <span className={`px-2 py-0.5 rounded-full text-xs ${character.accessType === 'premium'
                ? 'bg-purple-500/20 text-purple-400'
                : 'bg-success/20 text-success'
                }`}>
                {character.accessType}
            </span>
            <span className={`w-5 h-5 flex items-center justify-center rounded-full text-xs ${character.isActive
                ? 'bg-success/20 text-success'
                : 'bg-danger/20 text-danger'
                }`}>
                {character.isActive ? '✓' : '✗'}
            </span>
            {character.createdBy && (
                <span className="text-xs text-text-muted">
                    👤 {character.createdBy.name}
                </span>
            )}
            {(character.likesCount ?? 0) > 0 && (
                <span className="text-xs text-text-muted">
                    👍 {character.likesCount}
                </span>
            )}
            {character.genre && (
                <span className="text-xs text-text-muted">{character.genre}</span>
            )}
            {character.llmProvider && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                    {character.llmProvider}{character.llmModel ? `: ${character.llmModel.slice(0, 20)}` : ''}
                </span>
            )}
            {character.llmTemperature && (
                <span className="text-xs text-text-muted">T:{character.llmTemperature}</span>
            )}
            <button
                onClick={() => onEdit(character)}
                className="ml-auto px-3 py-1.5 rounded-lg text-xs bg-surface border border-border text-text-secondary
                    hover:bg-primary/10 hover:text-primary hover:border-primary/30 transition-colors"
            >
                Редактировать
            </button>
        </div>
    );
}
