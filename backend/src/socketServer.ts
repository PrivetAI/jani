import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { validateTelegramInitData } from './middlewares/auth.js';
import { chatSessionService } from './services/chatSessionService.js';
import { getCharacterById, countUserMessagesToday, recordMessage, getActiveSubscription, useBonusMessage, getBonusMessages, getUserDailyLimit } from './modules/index.js';
import { config } from './config.js';
import { logger } from './logger.js';
import { notifyAdminError } from './services/telegramNotifier.js';

interface AuthenticatedSocket extends Socket {
    userId: number;
    telegramUserId: number;
    username?: string;
}

interface ChatSendPayload {
    characterId: number;
    message: string;
}

export const createSocketServer = (httpServer: HttpServer): Server => {
    const io = new Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
        transports: ['websocket', 'polling'],
    });

    // Authentication middleware
    io.use(async (socket, next) => {
        const initData = socket.handshake.auth.initData as string;

        if (!initData) {
            logger.warn('Socket auth failed: no initData');
            return next(new Error('Authentication required'));
        }

        try {
            const authResult = await validateTelegramInitData(initData);
            if (!authResult) {
                logger.warn('Socket auth failed: invalid initData');
                return next(new Error('Invalid authentication'));
            }

            (socket as AuthenticatedSocket).userId = authResult.id;
            (socket as AuthenticatedSocket).telegramUserId = authResult.telegramUserId;
            (socket as AuthenticatedSocket).username = authResult.username;

            logger.info('Socket authenticated', { userId: authResult.id, telegramUserId: authResult.telegramUserId });
            next();
        } catch (err) {
            logger.error('Socket auth error', { error: (err as Error).message });
            next(new Error('Authentication failed'));
        }
    });

    io.on('connection', (rawSocket) => {
        const socket = rawSocket as AuthenticatedSocket;
        logger.info('Socket connected', { userId: socket.userId, socketId: socket.id });

        // Join user-specific room for targeting
        socket.join(`user:${socket.userId}`);

        // Handle chat message
        socket.on('chat:send', async (payload: ChatSendPayload) => {
            const { characterId, message } = payload;

            if (!characterId || !message?.trim()) {
                socket.emit('chat:error', { error: 'invalid_input', message: 'Сообщение обязательно' });
                return;
            }

            try {
                // Validate character
                const character = await getCharacterById(characterId);
                if (!character || !character.is_active) {
                    socket.emit('chat:error', { error: 'character_not_found', message: 'Персонаж не найден' });
                    return;
                }

                // Check subscription for premium characters
                const subscription = await getActiveSubscription(socket.userId);
                const hasSubscription = Boolean(subscription);
                if (character.access_type === 'premium' && !hasSubscription) {
                    socket.emit('chat:error', { error: 'premium_required', message: 'Требуется подписка для этого персонажа' });
                    return;
                }

                // Check daily limit for free users
                if (!hasSubscription) {
                    const used = await countUserMessagesToday(socket.userId);
                    const { limit } = await getUserDailyLimit(socket.userId);
                    if (used >= limit) {
                        // Try to use bonus message
                        const usedBonus = await useBonusMessage(socket.userId);
                        if (!usedBonus) {
                            const bonusBalance = await getBonusMessages(socket.userId);
                            socket.emit('chat:error', {
                                error: 'daily_limit_exceeded',
                                message: `Дневной лимит ${limit} сообщений исчерпан`,
                                limits: {
                                    remaining: 0,
                                    total: limit,
                                    resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
                                },
                                bonusMessages: bonusBalance,
                            });
                            return;
                        }
                    }
                }

                // Join character-specific room
                socket.join(`chat:${socket.userId}:${characterId}`);

                // Emit typing indicator
                socket.emit('chat:typing', { characterId });

                logger.info('Processing chat message', { userId: socket.userId, characterId, messageLength: message.length });

                // Process message via chatSessionService
                const result = await chatSessionService.processMessage({
                    telegramUserId: socket.telegramUserId,
                    username: socket.username,
                    messageText: message,
                    characterId,
                });

                // Record message in session
                await recordMessage(socket.userId, characterId);

                // Get updated limits and bonus
                const usedNow = await countUserMessagesToday(socket.userId);
                const { limit: currentLimit } = await getUserDailyLimit(socket.userId);
                const bonusBalance = await getBonusMessages(socket.userId);

                // Emit response
                socket.emit('chat:message', {
                    characterId,
                    userMessage: {
                        role: 'user',
                        text: message,
                        createdAt: new Date().toISOString(),
                    },
                    assistantMessage: {
                        role: 'assistant',
                        text: result.reply,
                        createdAt: new Date().toISOString(),
                    },
                    limits: {
                        remaining: Math.max(0, currentLimit - usedNow),
                        total: currentLimit,
                        resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
                    },
                    bonusMessages: bonusBalance,
                });

                logger.info('Chat message sent', { userId: socket.userId, characterId, replyLength: result.reply.length });
            } catch (error: any) {
                logger.error('Chat processing error', { userId: socket.userId, characterId, error: error.message });

                // Notify admin with detailed error log
                notifyAdminError({
                    userId: socket.userId,
                    telegramUserId: socket.telegramUserId,
                    characterId,
                    userMessage: message,
                    error,
                }).catch(err => {
                    logger.error('Failed to notify admin', { error: err.message });
                });

                // Show simple error to user
                socket.emit('chat:error', { error: 'llm_error', message: 'Произошла ошибка' });
            }
        });

        socket.on('disconnect', (reason) => {
            logger.info('Socket disconnected', { userId: socket.userId, reason });
        });
    });

    return io;
};
