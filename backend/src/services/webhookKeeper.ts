import { config } from '../config.js';
import { logger } from '../logger.js';
import { setWebAppPublicUrl } from '../runtimeConfig.js';

const TELEGRAM_API_BASE = `https://api.telegram.org/bot${config.telegramBotToken}`;

const setWebhook = async (url: string) => {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${TELEGRAM_API_BASE}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url,
        secret_token: config.telegramWebhookSecret,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`setWebhook failed: ${response.status} ${body}`);
    }
    logger.info('setWebhook ok', { url, durationMs: Date.now() - startedAt });
  } catch (error) {
    const err = error as Error & { cause?: unknown };
    logger.error('setWebhook fetch error', {
      url,
      durationMs: Date.now() - startedAt,
      error: err.message,
      stack: err.stack,
      cause: err.cause,
    });
    throw error;
  }
};

const fetchNgrokPublicUrl = async (): Promise<string | null> => {
  try {
    const res = await fetch(config.ngrokApiUrl, { method: 'GET' });
    if (!res.ok) {
      throw new Error(`ngrok api status ${res.status}`);
    }
    const data = (await res.json()) as { tunnels?: Array<{ public_url: string }> };
    const httpsTunnel = data.tunnels?.find((t) => t.public_url.startsWith('https://'));
    if (!httpsTunnel) {
      logger.info('Ngrok api responded but no https tunnel found', { tunnels: data.tunnels?.map((t) => t.public_url) });
    }
    return httpsTunnel?.public_url ?? null;
  } catch (error) {
    logger.error('Ngrok api poll failed', { error: (error as Error).message });
    return null;
  }
};

export const startWebhookKeeper = () => {
  if (!config.telegramAutoWebhook) {
    logger.info('Webhook keeper disabled (TELEGRAM_AUTO_WEBHOOK=false)');
    return;
  }

  let lastUrl: string | null = null;
  let lastMissingLogged = false;

  const tick = async () => {
    try {
      let targetUrl = config.telegramWebhookExternalUrl ?? null;
      let tunnelBase: string | null = null;
      if (!targetUrl) {
        const tunnel = await fetchNgrokPublicUrl();
        if (tunnel) {
          targetUrl = `${tunnel}/telegram/webhook`;
          tunnelBase = tunnel;
          logger.info('Ngrok tunnel detected for webhook', { tunnel });
        }
      }
      if (!targetUrl) {
        if (!lastMissingLogged) {
          logger.info('Webhook keeper: no URL yet (waiting for ngrok or TELEGRAM_WEBHOOK_EXTERNAL_URL)');
          lastMissingLogged = true;
        }
        return;
      }
      lastMissingLogged = false;
      if (targetUrl === lastUrl) {
        return;
      }
      await setWebhook(targetUrl);
      lastUrl = targetUrl;
      logger.info('Webhook updated', { targetUrl });

      // Если фронт не имеет публичного HTTPS (или остался localhost/http), но есть ngrok, используем его для кнопок WebApp.
      const unsafeWebApp =
        !config.webAppPublicUrl ||
        config.webAppPublicUrl.startsWith('http://') ||
        config.webAppPublicUrl.includes('localhost');
      if (unsafeWebApp && tunnelBase) {
        setWebAppPublicUrl(tunnelBase);
        logger.info('WebApp public URL set from ngrok', {
          webAppPublicUrl: tunnelBase,
          previous: config.webAppPublicUrl,
        });
      }
    } catch (error) {
      logger.error('Webhook keeper error', { error: (error as Error).message, stack: (error as Error).stack });
    }
  };

  // immediate attempt and then interval
  void tick();
  setInterval(tick, 30_000);
};
