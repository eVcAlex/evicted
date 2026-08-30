import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';

/** The admin UI. Unauthenticated -> redirect to the Clerk sign-in. */
const isAdminPage = createRouteMatcher(['/admin(.*)']);

/**
 * Admin API. Unauthenticated -> 401 with the body every client already
 * branches on. Listed one path at a time on purpose: `/api/monzo/callback`
 * (OAuth state), `/api/monzo/webhook` (Monzo does not sign its payloads),
 * `/api/cron/*` (separate cron secret) and `/api/push/subscribe` (public)
 * must never be caught here.
 */
const isAdminApi = createRouteMatcher([
  '/api/admin/(.*)',
  '/api/monzo/status',
  '/api/monzo/captured',
  '/api/monzo/members',
  '/api/monzo/pending',
  '/api/monzo/register-webhook',
  '/api/monzo/auth',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isAdminPage(req) && !isAdminApi(req)) return;

  const session = await auth();
  if (session.userId && isAdmin(session.sessionClaims as { email?: unknown })) return;

  if (isAdminApi(req)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  return session.redirectToSignIn();
});

export const config = {
  matcher: [
    // Everything except Next internals and static files, unless in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk's own frontend API routes
    '/__clerk/(.*)',
  ],
};
