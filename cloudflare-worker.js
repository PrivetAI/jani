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
        if (url.pathname.startsWith('/v1beta/')) {
            const geminiUrl = `https://generativelanguage.googleapis.com${url.pathname}${url.search}`;

            const response = await fetch(geminiUrl, {
                method: request.method,
                headers: { 'Content-Type': 'application/json' },
                body: request.method === 'POST' ? await request.text() : undefined,
            });

            return new Response(await response.text(), {
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