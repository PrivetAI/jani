import { config } from '../config.js';
import { logger } from '../logger.js';

const TELEGRAM_API_BASE = `https://api.telegram.org/bot${config.telegramBotToken}`;

// Subscription tiers
export const SUBSCRIPTION_TIERS = {
    weekly: { stars: 149, days: 7, label: 'Premium на 7 дней' },
    monthly: { stars: 349, days: 30, label: 'Premium на 30 дней' },
    quarterly: { stars: 949, days: 90, label: 'Premium на 90 дней' },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

interface InvoicePayload {
    userId: number;
    tier: SubscriptionTier;
}

/**
 * Create Telegram Stars invoice link via Bot API
 * https://core.telegram.org/bots/api#createinvoicelink
 */
export async function createInvoiceLink(
    userId: number,
    tier: SubscriptionTier
): Promise<string> {
    const tierConfig = SUBSCRIPTION_TIERS[tier];

    const payload: InvoicePayload = { userId, tier };

    const response = await fetch(`${TELEGRAM_API_BASE}/createInvoiceLink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: tierConfig.label,
            description: `Безлимитные сообщения и доступ к премиум-персонажам на ${tierConfig.days} дней`,
            payload: JSON.stringify(payload),
            currency: 'XTR', // Telegram Stars currency code
            prices: [{ label: tierConfig.label, amount: tierConfig.stars }],
        }),
    });

    const data = await response.json() as { ok: boolean; result?: string; description?: string };

    if (!data.ok || !data.result) {
        logger.error('Failed to create invoice link', { tier, userId, error: data.description });
        throw new Error(`Failed to create invoice: ${data.description || 'Unknown error'}`);
    }

    logger.info('Invoice link created', { userId, tier, stars: tierConfig.stars });
    return data.result;
}

/**
 * Answer pre_checkout_query - MUST respond within 10 seconds
 */
export async function answerPreCheckoutQuery(
    preCheckoutQueryId: string,
    ok: boolean,
    errorMessage?: string
): Promise<void> {
    const response = await fetch(`${TELEGRAM_API_BASE}/answerPreCheckoutQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            pre_checkout_query_id: preCheckoutQueryId,
            ok,
            error_message: errorMessage,
        }),
    });

    const data = await response.json() as { ok: boolean; description?: string };

    if (!data.ok) {
        logger.error('Failed to answer pre_checkout_query', { preCheckoutQueryId, error: data.description });
    }
}

/**
 * Parse and validate invoice payload from successful payment
 */
export function parseInvoicePayload(payloadStr: string): InvoicePayload | null {
    try {
        const payload = JSON.parse(payloadStr) as InvoicePayload;
        if (typeof payload.userId !== 'number' || !SUBSCRIPTION_TIERS[payload.tier]) {
            return null;
        }
        return payload;
    } catch {
        return null;
    }
}
