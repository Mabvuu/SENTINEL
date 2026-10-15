'use client';

export class RequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(
  path: string,
  method = 'GET',
  body?: unknown
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(45000),
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new RequestError(
      typeof data.detail === 'string' ? data.detail : Object.entries(data).map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(' ') : String(value)}`).join(' · ') || 'Request failed.',
      response.status
    );
  }
  return data as T;
}

let queue: Promise<unknown> = Promise.resolve();

async function sentinelOriginalRequest<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  refresh = true
): Promise<T> {
  async function operation(): Promise<T> {
    try {
      return await request<T>(path, method, body);
    } catch (error) {
      if (
        !refresh ||
        !(error instanceof RequestError) ||
        error.status !== 401
      ) {
        throw error;
      }

      await request('/api/auth/refresh', 'POST');
      return request<T>(path, method, body);
    }
  }

  // Serialize authentication and refresh across tabs where supported.
  async function run(): Promise<T> {
    if (navigator.locks) {
      return await navigator.locks.request(
        'sentinel-dashboard-session',
        operation
      );
    }
    return await operation();
  }


  // Independent reads do not wait behind other pages.
  // Authentication failures still use the existing serialized refresh.
  if (method.toUpperCase() === 'GET') {
    try {
      return await request<T>(path, method, body);
    } catch (error) {
      if (
        refresh === false ||
        (error instanceof RequestError) === false ||
        error.status !== 401
      ) {
        throw error;
      }
    }
  }

  const result = queue.then(run, run);
  queue = result.catch(() => undefined);
  return result;
}

/* Sentinel authentication lifecycle */
export async function dashboardRequest<T>(path: string, method = 'GET', body?: unknown, refresh = true): Promise<T> {
  try {
    const result = await sentinelOriginalRequest<T>(path, method, body, refresh);
    if (path.split('?')[0].replace(/\/$/, '') === '/api/auth/logout') {
      window.dispatchEvent(new Event('sentinel:signed-out'));
    }
    return result;
  } catch (error) {
    if (error instanceof RequestError && error.status === 401 && path.split('?')[0].replace(/\/$/, '') !== '/api/auth/login') {
      window.dispatchEvent(new Event('sentinel:signed-out'));
    }
    throw error;
  }
}
