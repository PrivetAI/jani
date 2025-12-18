import { logger } from './logger';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

type ApiOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  initData?: string | null;
};

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const method = options.method ?? 'GET';
  logger.api(method, path, options.body);

  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  const initData = options.initData ?? (window as any).__INIT_DATA__ ?? null;
  if (initData) {
    headers.set('x-telegram-init-data', initData);
  }

  const finalBody: BodyInit | null | undefined =
    options.body && !(options.body instanceof FormData) ? JSON.stringify(options.body) : (options.body as BodyInit);

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
    body: finalBody,
  });

  if (!response.ok) {
    let message = 'Ошибка запроса';
    try {
      const payload = await response.json();
      message = payload.message ?? message;
    } catch {
      // ignore
    }
    logger.apiResponse(method, path, response.status, { error: message });
    throw new Error(message);
  }

  if (response.status === 204) {
    logger.apiResponse(method, path, 204);
    return undefined as T;
  }

  const data = await response.json() as T;
  logger.apiResponse(method, path, response.status, data);
  return data;
}

