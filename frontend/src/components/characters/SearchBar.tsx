import { useState, useEffect } from 'react';

interface SearchBarProps {
    onSearch: (value: string) => void;
}

export function SearchBar({ onSearch }: SearchBarProps) {
    const [value, setValue] = useState('');

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            onSearch(value);
        }, 500);
        return () => clearTimeout(timer);
    }, [value, onSearch]);

    return (
        <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted">🔍</span>
            <input
                type="text"
                placeholder="Поиск персонажей..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="w-full pl-11 pr-4 py-3 rounded-xl bg-surface-light border border-border text-text-primary
                    placeholder:text-text-muted focus:outline-none focus:border-primary/50 focus:ring-2 focus:ring-primary/20"
            />
        </div>
    );
}
