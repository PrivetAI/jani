/**
 * Cloudflare Worker: Gemini API Proxy
 * 
 * Этот воркер проксирует запросы к Gemini API, обходя гео-блокировку.
 * 
 * Установка:
 * 1. Зайди на https://dash.cloudflare.com
 * 2. Создай аккаунт (бесплатно)
 * 3. Workers & Pages -> Create Application -> Create Worker
 * 4. Назови воркер (например: gemini-proxy)
 * 5. Нажми Deploy
 * 6. Нажми "Edit code"
 * 7. Замени весь код на содержимое этого файла
 * 8. Нажми "Deploy"
 * 9. Скопируй URL воркера (что-то вроде https://gemini-proxy.xxx.workers.dev)
 * 10. Добавь в .env на сервере: GEMINI_PROXY_URL=https://gemini-proxy.xxx.workers.dev
 */

export default {
    async fetch(request, env, ctx) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
                    'Access-Control-Max-Age': '86400',
                },
            });
        }

        const url = new URL(request.url);

        // Health check
        if (url.pathname === '/' || url.pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', service: 'gemini-proxy' }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Proxy to Gemini API
        // Expected path: /v1beta/models/gemini-xxx:generateContent?key=xxx
        if (url.pathname.startsWith('/v1beta/')) {
            const geminiUrl = `https://generativelanguage.googleapis.com${url.pathname}${url.search}`;

            const response = await fetch(geminiUrl, {
                method: request.method,
                headers: {
                    'Content-Type': 'application/json',
                },
                body: request.method === 'POST' ? await request.text() : undefined,
            });

            const responseBody = await response.text();

            return new Response(responseBody, {
                status: response.status,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        return new Response('Not Found', { status: 404 });
    },
};