import { cookies } from 'next/headers';

export class BackendError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export type Tokens = {
  access: string;
  refresh: string;
};

export type DashboardUser = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role: string;
};

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/',
};

export function json(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

export function failure(error: unknown) {
  if (error instanceof BackendError) {
    return json({ detail: error.message }, error.status);
  }
  return json({ detail: 'The server is unavailable. Please retry.' }, 502);
}

export function checkOrigin(request: Request) {
  const expected = new URL(
    process.env.APP_ORIGIN || request.url
  ).origin;

  if (request.headers.get('origin') !== expected) {
    throw new BackendError('Request origin is not allowed.', 403);
  }
}

export async function readJSON(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) {
    throw new BackendError('Send JSON data.', 415);
  }

  const raw = await request.text();
  if (raw.length > 16000) {
    throw new BackendError('Request is too large.', 413);
  }

  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error();
    }
    return data as Record<string, unknown>;
  } catch {
    throw new BackendError('Invalid JSON object.', 400);
  }
}

export async function backend<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  access?: string
): Promise<T> {
  const configured = process.env.DJANGO_API_URL;
  if (!configured) {
    throw new BackendError('The backend address is not configured.', 503);
  }

  const base = new URL(configured);
  if (
    base.protocol !== 'https:' &&
    !(process.env.NODE_ENV !== 'production' && base.protocol === 'http:')
  ) {
    throw new BackendError('The backend must use HTTPS.', 503);
  }

  const response = await fetch(
    `${configured.replace(/\/+$/, '')}${path}`,
    {
      method,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }
  );

  if (!response.ok) {
    const messages: Record<number, string> = {
      400: 'The submitted details were rejected.',
      401: 'Your credentials are incorrect or your session has expired.',
      403: 'You do not have permission to access this resource.',
      404: 'The requested resource was not found.',
      429: 'Too many requests. Please wait a minute and retry.',
    };

    throw new BackendError(
      messages[response.status] || 'The backend could not complete this request.',
      response.status >= 500 ? 502 : response.status
    );
  }

  return response.json() as Promise<T>;
}

export async function saveTokens(tokens: Tokens) {
  if (
    typeof tokens.access !== 'string' ||
    typeof tokens.refresh !== 'string'
  ) {
    throw new BackendError('Invalid authentication response.', 502);
  }

  const jar = await cookies();
  jar.set('sentinel_access', tokens.access, {
    ...cookieOptions,
    maxAge: 15 * 60,
  });
  jar.set('sentinel_refresh', tokens.refresh, {
    ...cookieOptions,
    maxAge: 7 * 24 * 60 * 60,
  });
}

export async function clearTokens() {
  const jar = await cookies();
  jar.set('sentinel_access', '', { ...cookieOptions, maxAge: 0 });
  jar.set('sentinel_refresh', '', { ...cookieOptions, maxAge: 0 });
}

export async function accessToken() {
  const value = (await cookies()).get('sentinel_access')?.value;
  if (!value) throw new BackendError('Please sign in.', 401);
  return value;
}

export async function refreshToken() {
  return (await cookies()).get('sentinel_refresh')?.value;
}

export async function dashboardUser(access: string) {
  const user = await backend<DashboardUser>(
    '/api/auth/me/', 'GET', undefined, access
  );

  if (!['admin', 'supervisor'].includes(user.role)) {
    throw new BackendError('Use an administrator or supervisor account.', 403);
  }

  return user;
}
