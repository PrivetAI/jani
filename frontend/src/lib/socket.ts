import { io, Socket } from 'socket.io-client';
import { logger } from './logger';

const SOCKET_URL = import.meta.env.VITE_API_BASE_URL ?? '';

interface SocketClient {
    socket: Socket | null;
    connect: (initData: string) => void;
    disconnect: () => void;
    isConnected: () => boolean;
    emit: <T>(event: string, data: T) => void;
    on: <T>(event: string, callback: (data: T) => void) => void;
    off: (event: string) => void;
}

let socketInstance: Socket | null = null;

export const socketClient: SocketClient = {
    socket: null,

    connect(initData: string) {
        if (socketInstance?.connected) {
            logger.info('Socket already connected');
            return;
        }

        logger.info('Connecting to WebSocket', { url: SOCKET_URL });

        socketInstance = io(SOCKET_URL, {
            auth: { initData },
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 5,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
        });

        socketInstance.on('connect', () => {
            logger.info('WebSocket connected', { socketId: socketInstance?.id });
        });

        socketInstance.on('disconnect', (reason) => {
            logger.warn('WebSocket disconnected', { reason });
        });

        socketInstance.on('connect_error', (error) => {
            logger.error('WebSocket connection error', { error: error.message });
        });

        this.socket = socketInstance;
    },

    disconnect() {
        if (socketInstance) {
            logger.info('Disconnecting WebSocket');
            socketInstance.disconnect();
            socketInstance = null;
            this.socket = null;
        }
    },

    isConnected() {
        return socketInstance?.connected ?? false;
    },

    emit<T>(event: string, data: T) {
        if (!socketInstance?.connected) {
            logger.warn('Cannot emit: socket not connected', { event });
            return;
        }
        logger.info('Socket emit', { event, data });
        socketInstance.emit(event, data);
    },

    on<T>(event: string, callback: (data: T) => void) {
        if (!socketInstance) {
            logger.warn('Cannot subscribe: socket not initialized', { event });
            return;
        }
        socketInstance.on(event, callback);
    },

    off(event: string) {
        if (socketInstance) {
            socketInstance.off(event);
        }
    },
};

export default socketClient;
