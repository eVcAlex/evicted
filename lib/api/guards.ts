import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { checkPin } from '@/lib/admin';

type Handler = (request: Request) => Promise<Response>;

/**
 * Wraps a route handler with the admin-PIN check shared by most `/api`
 * routes: reject with the same 401 body every one of them already returned
 * before this existed. Not every route wants this — `monzo/auth` takes the
 * PIN as a query param instead (it has to, see that route), `monzo/callback`
 * authenticates via OAuth state, `monzo/webhook` is deliberately
 * unauthenticated (Monzo doesn't sign its payloads), `cron/check-settled`
 * checks a separate cron secret, and `push/subscribe` is deliberately public.
 * Apply this only where the plain PIN-header check is the actual guard.
 */
export function withAdminAuth(handler: Handler): Handler {
  return async (request) => {
    if (!checkPin(request.headers.get('x-admin-pin'))) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
    }
    return handler(request);
  };
}

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: Response };

/**
 * Reads and validates a JSON request body against a zod schema, returning a
 * discriminated result so the caller decides what happens next rather than
 * this function short-circuiting the route.
 *
 * An unparseable body is the caller's fault, not a server fault — treated as
 * a plain 400 rather than throwing. A previous version let this throw, which
 * surfaced as a 500 the client could only read as "something's wrong", not
 * "you sent something wrong".
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<ParsedBody<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'bad request' }, { status: 400 }) };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, response: NextResponse.json({ error: 'bad request' }, { status: 400 }) };
  }

  return { ok: true, data: parsed.data };
}
