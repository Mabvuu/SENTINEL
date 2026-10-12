import {
  backend, checkOrigin, dashboardUser, failure, json,
  readJSON, saveTokens, BackendError, type Tokens,
} from '@/lib/server-api';

export async function POST(request: Request) {
  try {
    checkOrigin(request);
    const data = await readJSON(request);

    if (
      typeof data.username !== 'string' ||
      typeof data.password !== 'string' ||
      !data.username.trim() ||
      !data.password ||
      data.username.length > 150 ||
      data.password.length > 1024
    ) {
      throw new BackendError('Enter a valid username and password.', 400);
    }

    const tokens = await backend<Tokens>('/api/auth/login/', 'POST', {
      username: data.username.trim(),
      password: data.password,
    });

    try {
      const user = await dashboardUser(tokens.access);
      await saveTokens(tokens);
      return json({ user });
    } catch (error) {
      // Revoke the unused refresh token if this login cannot be completed.
      await backend('/api/auth/logout/', 'POST', {
        refresh: tokens.refresh,
      }).catch(() => undefined);
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}
