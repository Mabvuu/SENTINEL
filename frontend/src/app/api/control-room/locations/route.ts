import {
  accessToken, backend, dashboardUser, failure, json, BackendError,
} from '@/lib/server-api';

export async function GET(request: Request) {
  try {
    const page = new URL(request.url).searchParams.get('page') || '1';

    if (!/^[1-9]\d{0,5}$/.test(page)) {
      throw new BackendError('Invalid page number.', 400);
    }

    const access = await accessToken();
    await dashboardUser(access);

    const data = await backend(
      `/api/control-room/locations/?page=${page}`,
      'GET',
      undefined,
      access
    );

    return json(data);
  } catch (error) {
    return failure(error);
  }
}
