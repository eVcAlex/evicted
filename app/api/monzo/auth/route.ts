import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { checkPin } from '@/lib/admin';
import { MONZO_AUTH_URL, monzoClientCredentials, monzoRedirectUri } from '@/lib/monzo/config';

/**
 * Starts the OAuth handshake. Gated behind the admin PIN — this is the step
 * that links a real Monzo account, not a read of already-public league data.
 *
 * The PIN travels as a query param here, not a header, because the browser
 * must navigate (not fetch) to Monzo's authorise screen. That is the one
 * exception to "PIN never in a URL" in this codebase, and it is short-lived:
 * the link is generated client-side from the PIN already in `localStorage`
 * and used once, immediately — the request line this PIN rides in is never
 * itself sent anywhere; only the *destination* of the redirect below
 * (`auth.monzo.com`, cross-origin) sees a `Referer`, and the app-wide
 * `Referrer-Policy` in `next.config.ts` strips the query string from that.
 */
export async function GET(request: Request) {
  const suppliedPin = new URL(request.url).searchParams.get('pin');
  if (!checkPin(suppliedPin)) {
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
  // confirm the callback is answering *this* request, not a forged one.
  response.cookies.set('monzo_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
  });
  return response;
}
