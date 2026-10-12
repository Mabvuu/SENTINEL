import {
  backend, BackendError, checkOrigin, clearTokens,
  failure, json, refreshToken,
} from '@/lib/server-api';

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const refresh = await refreshToken();

    if (refresh) {
      try {
        await backend('/api/auth/logout/', 'POST', { refresh });
      } catch (error) {
        if (!(error instanceof BackendError && error.status === 401)) {
          throw error;
        }
      }
    }

    await clearTokens();
    return json({ detail: 'Signed out.' });
  } catch (error) {
    return failure(error);
  }
}
