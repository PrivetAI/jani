import React from 'react';

/**
 * Formats text with specific markdown-like syntax:
 * - __text__ -> italics (used for actions)
 * - **text** -> bold
 */
export const formatMessage = (text: string): React.ReactNode => {
    if (!text) return null;

    // Split by markers, capturing the markers and content
    // This regex matches **...** OR __...__
    const parts = text.split(/(\*\*.*?\*\*|__.*?__)/g);

    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
            return <strong key={index}>{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('__') && part.endsWith('__') && part.length >= 4) {
            return <em key={index} className="text-indigo-400 not-italic">{part.slice(2, -2)}</em>;
        }
        return <span key={index}>{part}</span>;
    });
};
