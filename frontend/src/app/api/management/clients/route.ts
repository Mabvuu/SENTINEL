import { cookies } from 'next/headers';

export const runtime = 'nodejs';

function reply(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

async function forward(request: Request) {
  try {
    const url = new URL(request.url);
    const method = request.method;

    if (method === 'POST' || method === 'PATCH') {
      const origin = new URL(
        process.env.APP_ORIGIN || request.url
      ).origin;

      if (request.headers.get('origin') !== origin) {
        return reply({ detail: 'Request origin rejected.' }, 403);
      }
    }

    const token = (await cookies()).get('sentinel_access')?.value;
    if (typeof token !== 'string' || token.length === 0) {
      return reply({ detail: 'Please sign in.' }, 401);
    }

    const configured = process.env.DJANGO_API_URL;
    if (typeof configured !== 'string' || configured.length === 0) {
      return reply({ detail: 'Backend URL is not configured.' }, 503);
    }

    const base = new URL(configured);
    const allowed =
      base.protocol === 'https:' ||
      (process.env.NODE_ENV !== 'production' &&
        base.protocol === 'http:');

    if (allowed === false) {
      return reply({ detail: 'Backend requires HTTPS.' }, 503);
    }

    let path = '/api/management/clients/';
    const query = new URLSearchParams();

    if (method === 'GET') {
      const page = url.searchParams.get('page') || '1';
      if (/^[1-9][0-9]{0,5}$/.test(page) === false) {
        return reply({ detail: 'Invalid page.' }, 400);
      }
      query.set('page', page);
      query.set(
        'search',
        (url.searchParams.get('search') || '').slice(0, 200)
      );
    }

    if (method === 'PATCH') {
      const id = url.searchParams.get('id') || '';
      if (/^[1-9][0-9]{0,14}$/.test(id) === false) {
        return reply({ detail: 'Invalid client.' }, 400);
      }
      path += `${id}/`;
    }

    let body: string | undefined;

    if (method === 'POST' || method === 'PATCH') {
      const contentType = request.headers.get('content-type') || '';
      if (contentType.includes('application/json') === false) {
        return reply({ detail: 'JSON is required.' }, 415);
      }

      const text = await request.text();
      if (text.length > 16000) {
        return reply({ detail: 'Request is too large.' }, 413);
      }

      try {
        const parsed = JSON.parse(text);
        if (
          parsed === null ||
          typeof parsed !== 'object' ||
          Array.isArray(parsed)
        ) {
          return reply({ detail: 'Invalid form data.' }, 400);
        }
        body = JSON.stringify(parsed);
      } catch {
        return reply({ detail: 'Invalid JSON.' }, 400);
      }
    }

    const target =
      configured.replace(/\/+$/, '') +
      path +
      (method === 'GET' ? `?${query.toString()}` : '');

    const response = await fetch(target, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body,
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(20000),
    });

    if (response.status >= 500) {
      return reply({ detail: 'Backend unavailable. Try again.' }, 502);
    }

    const data = await response.json();
    return reply(data, response.status);
  } catch {
    return reply({
      detail: 'Connection failed. Refresh the client list before retrying a save.',
    }, 502);
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
