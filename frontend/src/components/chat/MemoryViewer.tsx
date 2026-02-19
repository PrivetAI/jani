import { useState, useEffect } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useUserStore } from '../../store/userStore';

interface MemoryViewerProps {
    onClose: () => void;
}

export function MemoryViewer({ onClose }: MemoryViewerProps) {
    const { memories, selectedCharacter, deleteMemory, addMemory, loadMemories, isLoadingMemories } = useChatStore();
    const { initData } = useUserStore();
    const [newMemory, setNewMemory] = useState('');

    // Refresh memories when modal opens
    useEffect(() => {
        if (selectedCharacter && initData) {
            loadMemories(selectedCharacter.id, initData);
        }
    }, [selectedCharacter, initData, loadMemories]);

    const handleAdd = async () => {
        if (!newMemory.trim() || !selectedCharacter || !initData) return;
        await addMemory(selectedCharacter.id, newMemory, initData);
        setNewMemory('');
    };

    const handleDelete = async (id: number) => {
        if (!selectedCharacter || !initData) return;
        await deleteMemory(selectedCharacter.id, id, initData);
    };

    return (
        <div className="fixed top-0 right-0 bottom-0 left-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <div className="w-full max-w-md max-h-[80vh] flex flex-col rounded-2xl bg-surface/95 border border-border overflow-hidden">
                {/* Header */}
                <header className="flex items-center justify-between px-5 py-4 border-b border-border">
                    <h3 className="font-semibold text-lg">Память {selectedCharacter?.name}</h3>
                    <button
                        onClick={onClose}
                        className="px-3 py-1.5 rounded-lg text-sm bg-surface-light border border-border text-text-secondary
                            hover:bg-surface hover:text-text-primary transition-colors"
                    >
                        Закрыть
                    </button>
                </header>

                {/* Memory List */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {isLoadingMemories && <p className="text-text-muted text-center animate-pulse-slow">Загрузка...</p>}
                    {!isLoadingMemories && memories.length === 0 && (
                        <p className="text-text-muted text-center py-8">Пока нет воспоминаний.</p>
                    )}

                    {memories.map(m => (
                        <div key={m.id} className="flex items-start gap-3 p-3 rounded-xl bg-surface-light/50">
                            <p className="flex-1 text-sm text-text-primary">{m.content}</p>
                            <button
                                onClick={() => handleDelete(m.id)}
                                className="w-7 h-7 flex items-center justify-center rounded-lg
                                    bg-danger/20 text-danger hover:bg-danger/30 transition-colors text-sm"
                            >
                                ×
                            </button>
                        </div>
                    ))}
                </div>

                {/* Add Memory */}
                <div className="flex gap-2 p-4 border-t border-border">
                    <input
                        type="text"
                        value={newMemory}
                        onChange={e => setNewMemory(e.target.value)}
                        placeholder="Добавить факт..."
                        className="flex-1 px-4 py-2.5 rounded-xl bg-surface-light border border-border text-text-primary
                            placeholder:text-text-muted focus:outline-none focus:border-primary/50"
                    />
                    <button
                        onClick={handleAdd}
                        disabled={!newMemory.trim()}
                        className="w-10 h-10 rounded-xl flex items-center justify-center
                            bg-gradient-to-r from-primary to-indigo-500 text-white text-lg
                            disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        +
                    </button>
                </div>
            </div>
        </div>
    );
}
