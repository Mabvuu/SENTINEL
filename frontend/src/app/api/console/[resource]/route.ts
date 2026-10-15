import { accessToken, checkOrigin, failure, readJSON, json } from '@/lib/server-api';

export const runtime = 'nodejs';
const allowed = new Set(['summary', 'choices', 'entries', 'attendance', 'reports', 'contracts', 'invoices']);
async function forward(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const { resource } = await context.params;
    if (!allowed.has(resource)) return json({ detail: 'Not found.' }, 404);
    if (request.method !== 'GET') checkOrigin(request);
    const access = await accessToken();
    const configured = process.env.DJANGO_API_URL;
    if (!configured) return json({ detail: 'Set DJANGO_API_URL in frontend/.env.local.' }, 503);
    const base = new URL(configured);
    if (base.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && base.protocol === 'http:')) {
      return json({ detail: 'Backend requires HTTPS.' }, 503);
    }
    const url = new URL(request.url);
    const query = new URLSearchParams();
    for (const name of ['page', 'search', 'kind', 'id', 'from', 'to']) {
      const value = url.searchParams.get(name);
      if (value) query.set(name, value.slice(0, 200));
    }
    const response = await fetch(`${configured.replace(/\/+$/, '')}/api/console/${resource}/?${query}`, {
      method: request.method,
      headers: { Authorization: `Bearer ${access}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      ...(request.method === 'GET' ? {} : { body: JSON.stringify(await readJSON(request)) }),
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    if (response.status >= 500) return json({ detail: 'Backend error. Check the Django terminal.' }, 502);
    if (!response.headers.get('content-type')?.includes('application/json')) {
      return json({ detail: `Backend returned HTTP ${response.status}. Restart Django after installing the new routes.` }, 502);
    }
    return json(await response.json(), response.status);
  } catch (error) {
    return failure(error);
  }
}
export const GET = forward;
export const POST = forward;
export const PATCH = forward;
