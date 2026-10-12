import {
  accessToken, dashboardUser, failure, json,
} from '@/lib/server-api';

export async function GET() {
  try {
    const user = await dashboardUser(await accessToken());
    return json({ user });
  } catch (error) {
    return failure(error);
  }
}
