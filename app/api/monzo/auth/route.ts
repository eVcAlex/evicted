import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isAdmin } from '@/lib/admin';
import { MONZO_AUTH_URL, monzoClientCredentials, monzoRedirectUri } from '@/lib/monzo/config';

/**
 * Starts the OAuth handshake. Admin-only - this is the step that links a real
 * Monzo account, not a read of already-public league data. The browser
 * navigates here (it cannot `fetch` to Monzo's authorise screen), so the
 * Clerk session cookie rides along and `auth()` authenticates it like every
 * other admin route. `middleware.ts` also covers this path.
 */
export async function GET() {
  const { userId, sessionClaims } = await auth();
  if (!userId || !isAdmin(sessionClaims as { email?: unknown })) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  let clientId: string;
  let redirectUri: string;
  try {
    clientId = monzoClientCredentials().clientId;
    redirectUri = monzoRedirectUri();
  } catch (error) {
    console.error('Monzo OAuth config missing', error);
    return NextResponse.json({ error: 'Monzo is not configured yet' }, { status: 503 });
  }

  const state = randomBytes(24).toString('base64url');
  const authorizeUrl = new URL('/', MONZO_AUTH_URL);
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authorizeUrl);
  // Read back on /api/monzo/callback and compared with timingSafeEqual to
  // confirm the callback is answering this request, not a forged one.
  response.cookies.set('monzo_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
  });
  return response;
}
