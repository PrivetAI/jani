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
    systemPrompt: string;
    gender: string;
    llmModel?: string | null;
    llmProvider?: string | null;
    llmTemperature?: number | null;
    llmTopP?: number | null;
    llmRepetitionPenalty?: number | null;
    avatarUrl?: string | null;
    tags?: string[];
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



    const lines = [
        '👤 <b>Новый персонаж на модерацию</b>',
        '',
        `<b>ID:</b> <code>${context.characterId}</code>`,
        `<b>Имя:</b> ${escapeHtml(context.characterName)}`,
        `<b>Автор:</b> ${escapeHtml(context.authorName)} (ID: ${context.authorId})`,
        `<b>Пол:</b> ${context.gender === 'male' ? 'Мужской' : 'Женский'}`,
    ];



    if (context.tags && context.tags.length > 0) {
        lines.push(`<b>Теги:</b> ${context.tags.map(t => escapeHtml(t)).join(', ')}`);
    }

    lines.push('');
    lines.push(`<b>Описание:</b>`);
    lines.push(escapeHtml(descPreview));

    lines.push('');
    lines.push(`<b>Системный промпт:</b>`);
    lines.push(escapeHtml(context.systemPrompt));

    // LLM settings
    if (context.llmProvider || context.llmModel) {
        lines.push('');
        lines.push(`<b>LLM настройки:</b>`);
        if (context.llmProvider) {
            lines.push(`  Provider: <code>${context.llmProvider}</code>`);
        }
        if (context.llmModel) {
            lines.push(`  Model: <code>${escapeHtml(context.llmModel)}</code>`);
        }
        if (context.llmTemperature !== null && context.llmTemperature !== undefined) {
            lines.push(`  Temperature: ${context.llmTemperature}`);
        }
        if (context.llmTopP !== null && context.llmTopP !== undefined) {
            lines.push(`  Top P: ${context.llmTopP}`);
        }
        if (context.llmRepetitionPenalty !== null && context.llmRepetitionPenalty !== undefined) {
            lines.push(`  Repetition Penalty: ${context.llmRepetitionPenalty}`);
        }
    }

    lines.push('');
    lines.push(`<i>${timestamp}</i>`);

    const text = lines.join('\n');

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

interface CharacterApprovedContext {
    characterId: number;
    characterName: string;
    userTelegramId: number;
}

/**
 * Notify user that their character was approved
 */
interface PaymentSuccessContext {
    telegramUserId: number;
    username?: string;
    tier: string;
    tierLabel: string;
    stars: number;
    days: number;
    chargeId: string;
}

/**
 * Notify admins about successful Stars payment
 */
export async function notifyAdminPaymentSuccess(context: PaymentSuccessContext): Promise<void> {
    const adminIds = config.adminTelegramIds;
    if (!adminIds.length) return;

    const timestamp = new Date().toISOString();
    const userDisplay = context.username
        ? `@${escapeHtml(context.username)} (${context.telegramUserId})`
        : String(context.telegramUserId);

    const lines = [
        '💰💵💸 <b>Новая оплата Stars!</b> 💸💵💰',
        '',
        `<b>Пользователь:</b> ${userDisplay}`,
        `<b>Тариф:</b> ${escapeHtml(context.tierLabel)}`,
        `<b>Сумма:</b> ⭐️ ${context.stars} Stars`,
        `<b>Дней:</b> ${context.days}`,
        '',
        `<code>${context.chargeId}</code>`,
        '',
        `<i>${timestamp}</i>`,
    ];

    const text = lines.join('\n');

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
            logger.error('Failed to notify admin about payment', {
                adminId,
                error: (err as Error).message,
            });
        }
    }
}

interface PaymentFailedContext {
    telegramUserId: number;
    username?: string;
    reason: string;
    payload?: string;
}

/**
 * Notify admins about failed payment processing
 */
export async function notifyAdminPaymentFailed(context: PaymentFailedContext): Promise<void> {
    const adminIds = config.adminTelegramIds;
    if (!adminIds.length) return;

    const timestamp = new Date().toISOString();
    const userDisplay = context.username
        ? `@${escapeHtml(context.username)} (${context.telegramUserId})`
        : String(context.telegramUserId);

    const lines = [
        '❌💸 <b>Ошибка обработки оплаты</b> 💸❌',
        '',
        `<b>Пользователь:</b> ${userDisplay}`,
        `<b>Причина:</b> ${escapeHtml(context.reason)}`,
    ];

    if (context.payload) {
        lines.push(`<b>Payload:</b> <code>${escapeHtml(context.payload)}</code>`);
    }

    lines.push('');
    lines.push(`<i>${timestamp}</i>`);

    const text = lines.join('\n');

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
            logger.error('Failed to notify admin about payment failure', {
                adminId,
                error: (err as Error).message,
            });
        }
    }
}

export async function notifyUserCharacterApproved(context: CharacterApprovedContext): Promise<void> {
    const text = [
        '✅ <b>Ваш персонаж одобрен!</b>',
        '',
        `<b>Персонаж:</b> ${escapeHtml(context.characterName)}`,
        '',
        'Теперь он доступен в общем каталоге персонажей!',
    ].join('\n');

    try {
        await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: context.userTelegramId,
                text,
                parse_mode: 'HTML',
            }),
        });
        logger.info('User notified about character approval', {
            characterId: context.characterId,
            userTelegramId: context.userTelegramId,
        });
    } catch (err) {
        logger.error('Failed to notify user about character approval', {
            characterId: context.characterId,
            userTelegramId: context.userTelegramId,
            error: (err as Error).message,
        });
    }
}

interface CharacterRejectedContext {
    characterId: number;
    characterName: string;
    userTelegramId: number;
    reason: string;
}

/**
 * Notify user that their character was rejected
 */
export async function notifyUserCharacterRejected(context: CharacterRejectedContext): Promise<void> {
    const text = [
        '❌ <b>Ваш персонаж отклонен</b>',
        '',
        `<b>Персонаж:</b> ${escapeHtml(context.characterName)}`,
        `<b>Причина:</b> ${escapeHtml(context.reason)}`,
        '',
        'Пожалуйста, отредактируйте и мы проверим его еще раз',
        'Ваши персонажи отображаются в «Профиль» → «Мои персонажи»',
    ].join('\n');

    try {
        await fetch(`${TELEGRAM_API_BASE}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: context.userTelegramId,
                text,
                parse_mode: 'HTML',
            }),
        });
        logger.info('User notified about character rejection', {
            characterId: context.characterId,
            userTelegramId: context.userTelegramId,
        });
    } catch (err) {
        logger.error('Failed to notify user about character rejection', {
            characterId: context.characterId,
            userTelegramId: context.userTelegramId,
            error: (err as Error).message,
        });
    }
}
