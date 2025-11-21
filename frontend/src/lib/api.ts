const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '';

type ApiOptions = Omit<RequestInit, 'body'> & {
  body?: unknown;
  initData?: string | null;
};

export async function apiRequest<T>(path: string, options: ApiOptions = {}): Promise<T> {
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
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
