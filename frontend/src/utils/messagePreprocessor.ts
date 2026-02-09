/**
 * Convert *text* patterns to __text__ for consistent emphasis formatting
 */
export function preprocessMessage(text: string): string {
    // Replace *text* with __text__ (non-greedy match)
    return text.replace(/\*([^*]+)\*/g, '__$1__');
}
