/**
 * Frontend logger utility with environment toggle
 * Enable via VITE_DEBUG_LOG=true in .env or docker-compose
 */

const isEnabled = import.meta.env.VITE_DEBUG_LOG === 'true';

const styles = {
    info: 'color: #60a5fa; font-weight: bold',
    warn: 'color: #fbbf24; font-weight: bold',
    error: 'color: #f87171; font-weight: bold',
    api: 'color: #a78bfa; font-weight: bold',
    store: 'color: #34d399; font-weight: bold',
    nav: 'color: #fb923c; font-weight: bold',
};

const formatTime = () => new Date().toLocaleTimeString('ru-RU', { hour12: false });

export const logger = {
    info: (message: string, data?: any) => {
        if (!isEnabled) return;
        console.log(`%c[${formatTime()}] ℹ️ ${message}`, styles.info, data ?? '');
    },

    warn: (message: string, data?: any) => {
        if (!isEnabled) return;
        console.warn(`%c[${formatTime()}] ⚠️ ${message}`, styles.warn, data ?? '');
    },

    error: (message: string, data?: any) => {
        if (!isEnabled) return;
        console.error(`%c[${formatTime()}] ❌ ${message}`, styles.error, data ?? '');
    },

    api: (method: string, url: string, data?: any) => {
        if (!isEnabled) return;
        console.log(`%c[${formatTime()}] 🌐 ${method} ${url}`, styles.api, data ?? '');
    },

    apiResponse: (method: string, url: string, status: number, data?: any) => {
        if (!isEnabled) return;
        const icon = status >= 400 ? '❌' : '✅';
        console.log(`%c[${formatTime()}] ${icon} ${method} ${url} → ${status}`, styles.api, data ?? '');
    },

    store: (storeName: string, action: string, data?: any) => {
        if (!isEnabled) return;
        console.log(`%c[${formatTime()}] 📦 [${storeName}] ${action}`, styles.store, data ?? '');
    },

    nav: (from: string, to: string) => {
        if (!isEnabled) return;
        console.log(`%c[${formatTime()}] 🧭 Navigation: ${from} → ${to}`, styles.nav);
    },
};

export default logger;
