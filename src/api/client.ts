/**
 * The one place that talks to the backend.
 *
 * Every endpoint answers with a `{ success, ... }` envelope and Arabic error
 * text, so failures are surfaced with the server's own wording rather than a
 * generic message the operator cannot act on.
 */

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  /** The session is gone or was never for an owner account. */
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

const NETWORK_DOWN = 'تعذر الوصول للخادم. تأكد أن الواجهة الخلفية تعمل على المنفذ 43147.';
const UNREADABLE = 'رد الخادم غير مفهوم.';

type Envelope = { success?: boolean; error?: string; message?: string };

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, {
      // The session rides an HttpOnly cookie, so every call must carry it.
      credentials: 'include',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    throw new ApiError(NETWORK_DOWN, 0);
  }

  const text = await response.text();
  let payload: (Envelope & Record<string, unknown>) | null = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // An HTML error page or a proxy failure — not something to show raw.
      if (!response.ok) throw new ApiError(UNREADABLE, response.status);
    }
  }

  if (!response.ok || payload?.success === false) {
    const message = payload?.error || payload?.message || UNREADABLE;
    throw new ApiError(message, response.status);
  }
  return (payload ?? {}) as T;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  put: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
};

export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'حدث خطأ غير متوقع.';
}
