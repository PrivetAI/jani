import { config } from '../config.js';
import { logger } from '../logger.js';

const TELEGRAM_API_BASE = `https://api.telegram.org/bot${config.telegramBotToken}`;

// Subscription tiers
export const SUBSCRIPTION_TIERS = {
    monthly: { stars: 599, days: 30, label: 'Premium на 1 месяц' },
    quarterly: { stars: 1490, days: 90, label: 'Premium на 3 месяца' },
    semiannual: { stars: 2690, days: 180, label: 'Premium на 6 месяцев' },
} as const;

export type SubscriptionTier = keyof typeof SUBSCRIPTION_TIERS;

// Message bundles (one-time purchase, no expiration)
export const MESSAGE_BUNDLES = {
    bundle_100: { stars: 149, messages: 100, label: '100 сообщений' },
    bundle_300: { stars: 319, messages: 300, label: '300 сообщений' },
    bundle_700: { stars: 589, messages: 700, label: '700 сообщений' },
} as const;

export type MessageBundle = keyof typeof MESSAGE_BUNDLES;

interface SubscriptionPayload {
    type: 'subscription';
    userId: number;
    tier: SubscriptionTier;
}

interface BundlePayload {
    type: 'bundle';
    userId: number;
    bundle: MessageBundle;
}

export type InvoicePayload = SubscriptionPayload | BundlePayload;

/**
 * Create Telegram Stars invoice link for subscription
 */
export async function createSubscriptionInvoiceLink(
    userId: number,
    tier: SubscriptionTier
): Promise<string> {
    const tierConfig = SUBSCRIPTION_TIERS[tier];

    const payload: SubscriptionPayload = { type: 'subscription', userId, tier };

    const response = await fetch(`${TELEGRAM_API_BASE}/createInvoiceLink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: tierConfig.label,
            description: `Безлимитные сообщения и выбор ИИ моделей на ${tierConfig.days} дней`,
            payload: JSON.stringify(payload),
            currency: 'XTR',
            prices: [{ label: tierConfig.label, amount: tierConfig.stars }],
        }),
    });

    const data = await response.json() as { ok: boolean; result?: string; description?: string };

    if (!data.ok || !data.result) {
        logger.error('Failed to create subscription invoice link', { tier, userId, error: data.description });
        throw new Error(`Failed to create invoice: ${data.description || 'Unknown error'}`);
    }

    logger.info('Subscription invoice link created', { userId, tier, stars: tierConfig.stars });
    return data.result;
}

/**
 * Create Telegram Stars invoice link for message bundle
 */
export async function createBundleInvoiceLink(
    userId: number,
    bundle: MessageBundle
): Promise<string> {
    const bundleConfig = MESSAGE_BUNDLES[bundle];

    const payload: BundlePayload = { type: 'bundle', userId, bundle };

    const response = await fetch(`${TELEGRAM_API_BASE}/createInvoiceLink`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title: bundleConfig.label,
            description: `${bundleConfig.messages} дополнительных сообщений сверх дневного лимита`,
            payload: JSON.stringify(payload),
            currency: 'XTR',
            prices: [{ label: bundleConfig.label, amount: bundleConfig.stars }],
        }),
    });

    const data = await response.json() as { ok: boolean; result?: string; description?: string };

    if (!data.ok || !data.result) {
        logger.error('Failed to create bundle invoice link', { bundle, userId, error: data.description });
        throw new Error(`Failed to create invoice: ${data.description || 'Unknown error'}`);
    }

    logger.info('Bundle invoice link created', { userId, bundle, stars: bundleConfig.stars });
    return data.result;
}

// Legacy function for backward compatibility
export async function createInvoiceLink(
    userId: number,
    tier: SubscriptionTier
): Promise<string> {
    return createSubscriptionInvoiceLink(userId, tier);
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
        const payload = JSON.parse(payloadStr);

        // New format with type
        if (payload.type === 'subscription' && typeof payload.userId === 'number' && SUBSCRIPTION_TIERS[payload.tier as SubscriptionTier]) {
            return payload as SubscriptionPayload;
        }

        if (payload.type === 'bundle' && typeof payload.userId === 'number' && MESSAGE_BUNDLES[payload.bundle as MessageBundle]) {
            return payload as BundlePayload;
        }

        // Legacy format (no type field = subscription)
        if (typeof payload.userId === 'number' && SUBSCRIPTION_TIERS[payload.tier as SubscriptionTier]) {
            return { type: 'subscription', userId: payload.userId, tier: payload.tier } as SubscriptionPayload;
        }

        return null;
    } catch {
        return null;
    }
}
