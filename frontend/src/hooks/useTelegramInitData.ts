import { useEffect, useState } from 'react';

interface TelegramWebApp {
  initData?: string;
  ready?: () => void;
  openInvoice?: (
    url: string,
    callback?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void
  ) => void;
  openTelegramLink?: (url: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
    __INIT_DATA__?: string;
  }
}

export const useTelegramInitData = () => {
  const [initData, setInitData] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg?.initData) {
      setInitData(tg.initData);
      window.__INIT_DATA__ = tg.initData;
      tg.ready?.();
      setLoaded(true);
      return;
    }

    const mock = import.meta.env.VITE_MOCK_TELEGRAM_INIT_DATA;
    if (mock) {
      setInitData(mock);
      window.__INIT_DATA__ = mock;
    }
    setLoaded(true);
  }, []);

  return { initData, loaded } as const;
};
