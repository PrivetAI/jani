/**
 * Gender declension utilities for Russian language
 */

export type GrammaticalGender = 'male' | 'female';

/**
 * Returns word form based on grammatical gender
 * @param gender - 'male' or 'female'
 * @param maleForm - word form for male (он)
 * @param femaleForm - word form for female (она)
 */
export function decline(
    gender: GrammaticalGender | undefined,
    maleForm: string,
    femaleForm: string
): string {
    return gender === 'male' ? maleForm : femaleForm;
}

/**
 * Common verb declensions
 */
export const verbs = {
    typing: (gender?: GrammaticalGender) => decline(gender, 'печатает', 'печатает'), // same in Russian
    thinking: (gender?: GrammaticalGender) => decline(gender, 'думает', 'думает'),
    wrote: (gender?: GrammaticalGender) => decline(gender, 'написал', 'написала'),
    replied: (gender?: GrammaticalGender) => decline(gender, 'ответил', 'ответила'),
    sent: (gender?: GrammaticalGender) => decline(gender, 'отправил', 'отправила'),
    read: (gender?: GrammaticalGender) => decline(gender, 'прочитал', 'прочитала'),
    online: (gender?: GrammaticalGender) => decline(gender, 'онлайн', 'онлайн'),
    offline: (gender?: GrammaticalGender) => decline(gender, 'офлайн', 'офлайн'),
};

/**
 * Status text with gender declension
 */
export function getTypingStatus(gender?: GrammaticalGender): string {
    return `✍️ ${verbs.typing(gender)}...`;
}
