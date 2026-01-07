import React from 'react';

/**
 * Formats text with specific markdown-like syntax:
 * - __text__ -> italics (used for actions)
 * - **text** -> bold
 */
/**
 * Renders text with line breaks
 */
const renderWithLineBreaks = (text: string, keyPrefix: string): React.ReactNode => {
    const lines = text.split('\n');
    return lines.map((line, i) => (
        <React.Fragment key={`${keyPrefix}-line-${i}`}>
            {line}
            {i < lines.length - 1 && <br />}
        </React.Fragment>
    ));
};

export const formatMessage = (text: string): React.ReactNode => {
    if (!text) return null;

    // Split by markers, capturing the markers and content
    // This regex matches **...** OR __...__
    const parts = text.split(/(\*\*.*?\*\*|__.*?__)/g);

    return parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
            return <strong key={index}>{renderWithLineBreaks(part.slice(2, -2), `bold-${index}`)}</strong>;
        }
        if (part.startsWith('__') && part.endsWith('__') && part.length >= 4) {
            return <em key={index} className="text-indigo-400 not-italic">{renderWithLineBreaks(part.slice(2, -2), `em-${index}`)}</em>;
        }
        return <React.Fragment key={index}>{renderWithLineBreaks(part, `text-${index}`)}</React.Fragment>;
    });
};
