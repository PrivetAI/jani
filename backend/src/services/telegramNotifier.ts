import { config } from '../config.js';
import { logger } from '../logger.js';

const TELEGRAM_API_BASE = `https://api.telegram.org/bot${config.telegramBotToken}`;

interface ErrorContext {
    userId?: number;
    telegramUserId?: number;
    characterId?: number;
    characterName?: string;
    userMessage?: string;
    error: Error | string;
    provider?: string;
    model?: string;
}

/**
 * Send error notification to all admin Telegram IDs
 */
export async function notifyAdminError(context: ErrorContext): Promise<void> {
    const adminIds = config.adminTelegramIds;

    if (!adminIds.length) {
        logger.warn('No admin Telegram IDs configured, skipping error notification');
        return;
    }

    const errorMessage = context.error instanceof Error
        ? context.error.message
        : String(context.error);

    const errorStack = context.error instanceof Error
        ? context.error.stack
        : undefined;

    const timestamp = new Date().toISOString();

    // Format detailed error message
    const lines = [
        '🚨 <b>LLM Error</b>',
        '',
        `<b>Time:</b> <code>${timestamp}</code>`,
    ];

    if (context.userId !== undefined) {
        lines.push(`<b>User ID:</b> <code>${context.userId}</code>`);
    }
    if (context.telegramUserId !== undefined) {
        lines.push(`<b>Telegram ID:</b> <code>${context.telegramUserId}</code>`);
    }
    if (context.characterId !== undefined) {
        lines.push(`<b>Character ID:</b> <code>${context.characterId}</code>`);
    }
    if (context.characterName) {
        lines.push(`<b>Character:</b> ${escapeHtml(context.characterName)}`);
    }
    if (context.provider) {
        lines.push(`<b>Provider:</b> <code>${context.provider}</code>`);
    }
    if (context.model) {
        lines.push(`<b>Model:</b> <code>${context.model}</code>`);
    }
    if (context.userMessage) {
        const truncated = context.userMessage.length > 200
            ? context.userMessage.slice(0, 200) + '...'
            : context.userMessage;
        lines.push(`<b>User Message:</b> ${escapeHtml(truncated)}`);
    }

    lines.push('');
    lines.push(`<b>Error:</b> <code>${escapeHtml(errorMessage)}</code>`);

    if (errorStack) {
        const truncatedStack = errorStack.length > 500
            ? errorStack.slice(0, 500) + '...'
            : errorStack;
        lines.push('');
        lines.push(`<b>Stack:</b>\n<pre>${escapeHtml(truncatedStack)}</pre>`);
    }

    const text = lines.join('\n');

    // Send to all admins
    for (const adminId of adminIds) {
        try {
            const response = await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: adminId,
                    text,
                    parse_mode: 'HTML',
                }),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                logger.error('Failed to send Telegram notification', {
                    adminId,
                    status: response.status,
                    error: errorBody,
                });
            } else {
                logger.info('Admin notification sent', { adminId });
            }
        } catch (err) {
            logger.error('Telegram notification error', {
                adminId,
                error: (err as Error).message,
            });
        }
    }
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

interface NewCharacterContext {
    characterId: number;
    characterName: string;
    authorId: number;
    authorName: string;
    description: string;
}

/**
 * Notify admins about new UGC character submission
 */
export async function notifyNewCharacter(context: NewCharacterContext): Promise<void> {
    const adminIds = config.adminTelegramIds;
    if (!adminIds.length) return;

    const timestamp = new Date().toISOString();
    const descPreview = context.description.length > 150
        ? context.description.slice(0, 150) + '...'
        : context.description;

    const text = [
        '👤 <b>Новый персонаж на модерацию</b>',
        '',
        `<b>ID:</b> <code>${context.characterId}</code>`,
        `<b>Имя:</b> ${escapeHtml(context.characterName)}`,
        `<b>Автор:</b> ${escapeHtml(context.authorName)} (ID: ${context.authorId})`,
        '',
        `<b>Описание:</b>`,
        escapeHtml(descPreview),
        '',
        `<i>${timestamp}</i>`,
    ].join('\n');

    for (const adminId of adminIds) {
        try {
            await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: adminId,
                    text,
                    parse_mode: 'HTML',
                }),
            });
        } catch (err) {
            logger.error('Failed to notify about new character', {
                adminId,
                error: (err as Error).message,
            });
        }
    }
}
