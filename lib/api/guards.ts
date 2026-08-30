import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { isAdmin } from '@/lib/admin';

type Handler = (request: Request) => Promise<Response>;

/**
 * Wraps a route handler with the admin check shared by most `/api` routes:
 * a signed-in Clerk session whose verified email is on `ADMIN_ALLOWLIST`.
 * Rejects with the same 401 body every one of these routes returned under the
 * old PIN scheme, so clients need no changes.
 *
 * This duplicates the check `middleware.ts` already runs for these paths, on
 * purpose: the guard is the contract each route file relies on, and a second
 * `auth()` call is cheap. Routes that authenticate differently do not use
 * this: `monzo/callback` uses OAuth state, `monzo/webhook` is unauthenticated
 * (Monzo does not sign payloads), `cron/*` checks a cron secret, and
 * `push/subscribe` is deliberately public.
 */
export function withAdminAuth(handler: Handler): Handler {
  return async (request) => {
    const { userId, sessionClaims } = await auth();
    if (!userId || !isAdmin(sessionClaims as { email?: unknown })) {
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
