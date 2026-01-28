const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

/**
 * Converts relative image URLs to absolute URLs pointing to the backend.
 * Handles /uploads/ paths that need to be proxied to backend.
 */
export function getImageUrl(url: string | null | undefined): string {
    if (!url) return '/placeholder.jpg';

    // If already absolute URL, return as-is
    if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
    }

    // For /uploads/ paths, prepend API base URL
    if (url.startsWith('/uploads/')) {
        return `${API_BASE_URL}${url}`;
    }

    // For other relative paths, return as-is (they might be in public folder)
    return url;
}

/**
 * Returns character avatar URL or default avatar based on gender.
 * @param url - Custom avatar URL (can be null/undefined)
 * @param gender - Character grammatical gender ('male' | 'female')
 * @returns Processed avatar URL
 */
export function getCharacterAvatarUrl(url: string | null | undefined, gender: 'male' | 'female' = 'female'): string {
    if (!url) {
        return gender === 'male' ? '/avatars/male-default.png' : '/avatars/female-default.png';
    }

    return getImageUrl(url);
}
