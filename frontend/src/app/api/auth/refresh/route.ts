import {
  backend, BackendError, checkOrigin, clearTokens,
  dashboardUser, failure, json, refreshToken,
  saveTokens, type Tokens,
} from '@/lib/server-api';

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const refresh = await refreshToken();
    if (!refresh) throw new BackendError('Please sign in.', 401);

    const tokens = await backend<Tokens>(
      '/api/auth/refresh/', 'POST', { refresh }
    );

    // Persist rotated tokens before making another backend request.
    await saveTokens(tokens);

    try {
      const user = await dashboardUser(tokens.access);
      return json({ user });
    } catch (error) {
      if (error instanceof BackendError && error.status === 403) {
        await backend('/api/auth/logout/', 'POST', {
          refresh: tokens.refresh,
        }).catch(() => undefined);
        await clearTokens();
      }
      throw error;
    }
  } catch (error) {
    if (error instanceof BackendError && error.status === 401) {
      await clearTokens();
    }
    return failure(error);
  }
}
