import { Server as HttpServer } from 'http';
import { Server, Socket } from 'socket.io';
import { validateTelegramInitData } from './middlewares/auth.js';
import { chatSessionService } from './services/chatSessionService.js';
import { getCharacterById, countUserMessagesToday, recordMessage, getActiveSubscription } from './modules/index.js';
import { config } from './config.js';
import { logger } from './logger.js';

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
                    if (used >= config.freeDailyMessageLimit) {
                        socket.emit('chat:error', {
                            error: 'daily_limit_exceeded',
                            message: `Дневной лимит ${config.freeDailyMessageLimit} сообщений исчерпан`,
                            limits: {
                                remaining: 0,
                                total: config.freeDailyMessageLimit,
                                resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
                            },
                        });
                        return;
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

                // Get updated limits
                const usedNow = await countUserMessagesToday(socket.userId);

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
                        remaining: Math.max(0, config.freeDailyMessageLimit - usedNow),
                        total: config.freeDailyMessageLimit,
                        resetsAt: new Date(new Date().setHours(24, 0, 0, 0)).toISOString(),
                    },
                });

                logger.info('Chat message sent', { userId: socket.userId, characterId, replyLength: result.reply.length });
            } catch (error: any) {
                logger.error('Chat processing error', { userId: socket.userId, characterId, error: error.message });
                socket.emit('chat:error', { error: 'llm_error', message: error.message });
            }
        });

        socket.on('disconnect', (reason) => {
            logger.info('Socket disconnected', { userId: socket.userId, reason });
        });
    });

    return io;
};
