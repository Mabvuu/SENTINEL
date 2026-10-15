import * as SecureStore from './sessionStorage';

type Tokens = { access: string; refresh: string };

export type User = {
  id: number;
  username: string;
  first_name: string;
  last_name: string;
  role: string;
};

export type Shift = {
  id: number;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string;
  site: {
    id: number;
    name: string;
    address: string;
    latitude: string;
    longitude: string;
    radius_metres: number;
    max_accuracy_metres: number;
  };
  attendance: null | {
    id: number;
    clocked_in_at: string;
    clocked_out_at: string | null;
    clock_out_gps_verified: boolean;
    clock_out_note: string;
  };
};

export type ShiftPage = {
  count: number;
  next: string | null;
  results: Shift[];
};

const SESSION_KEY = 'sentinel.session';
let refreshing: Promise<Tokens> | null = null;

export class APIError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

function baseURL(): string {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
  if (!value) {
    throw new Error('Server address is not configured yet.');
  }
  if (!value.startsWith('https://') &&
      !(__DEV__ && value.startsWith('http://'))) {
    throw new Error('The server address must use HTTPS.');
  }
  return value;
}

function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(describe).join(' ');
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([key, item]) => `${key}: ${describe(item)}`).join('\n');
  }
  return 'The request could not be completed.';
}

async function request<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  access?: string,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

  try {
    const response = await fetch(`${baseURL()}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });

    const text = await response.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new APIError('The server returned an unexpected response.', response.status);
    }

    if (!response.ok) {
      throw new APIError(describe(data), response.status);
    }
    return data as T;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('The server took too long. Check your connection and retry.');
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function getSession(): Promise<Tokens | null> {
  const saved = await SecureStore.getItemAsync(SESSION_KEY);
  if (!saved) return null;
  try {
    const parsed = JSON.parse(saved);
    if (typeof parsed.access === 'string' && typeof parsed.refresh === 'string') {
      return parsed;
    }
  } catch {}
  await clearSession();
  return null;
}

export async function clearSession(): Promise<void> {
  await SecureStore.deleteItemAsync(SESSION_KEY);
}

async function saveSession(tokens: Tokens): Promise<void> {
  await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(tokens), {
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
  });
}

export async function login(username: string, password: string): Promise<void> {
  const tokens = await request<Tokens>('/api/auth/login/', 'POST', {
    username: username.trim(), password,
  });
  await saveSession(tokens);
}

async function refreshSession(): Promise<Tokens> {
  if (!refreshing) {
    refreshing = (async () => {
      const saved = await getSession();
      if (!saved) throw new APIError('Please sign in.', 401);

      try {
        const tokens = await request<Tokens>('/api/auth/refresh/', 'POST', {
          refresh: saved.refresh,
        });
        await saveSession(tokens);
        return tokens;
      } catch (error) {
        if (error instanceof APIError && error.status === 401) {
          await clearSession();
        }
        throw error;
      }
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api<T>(
  path: string, method = 'GET', body?: unknown,
): Promise<T> {
  const saved = await getSession();
  if (!saved) throw new APIError('Please sign in.', 401);

  try {
    return await request<T>(path, method, body, saved.access);
  } catch (error) {
    if (!(error instanceof APIError) || error.status !== 401) throw error;
    const tokens = await refreshSession();
    return request<T>(path, method, body, tokens.access);
  }
}

export async function logout(): Promise<void> {
  const saved = await getSession();
  if (saved) {
    try {
      await request('/api/auth/logout/', 'POST', { refresh: saved.refresh });
    } catch (error) {
      // An expired or already-revoked refresh token can be removed locally.
      if (!(error instanceof APIError) || error.status !== 401) throw error;
    }
  }
  await clearSession();
}
