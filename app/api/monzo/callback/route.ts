import { NextResponse } from 'next/server';
import { MONZO_API_BASE, monzoClientCredentials, monzoRedirectUri } from '@/lib/monzo/config';
import { monzoTokenResponseSchema } from '@/lib/monzo/schemas';
import { verifyState } from '@/lib/monzo/state';
import { saveTokens } from '@/lib/monzo/store';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  const cookieState = request.headers
    .get('cookie')
    ?.match(/monzo_oauth_state=([^;]+)/)?.[1];

  if (!code || !verifyState(cookieState, returnedState)) {
    return NextResponse.json({ error: 'invalid or expired authorisation attempt' }, { status: 400 });
  }

  const { clientId, clientSecret } = monzoClientCredentials();

  const tokenRes = await fetch(`${MONZO_API_BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: monzoRedirectUri(),
      code,
    }),
  });

  if (!tokenRes.ok) {
    console.error('Monzo token exchange failed', tokenRes.status, await tokenRes.text());
    return NextResponse.json({ error: 'token exchange failed' }, { status: 502 });
  }

  const parsed = monzoTokenResponseSchema.safeParse(await tokenRes.json());
  if (!parsed.success) {
    console.error('Monzo token response failed validation', parsed.error);
    return NextResponse.json({ error: 'unexpected response from Monzo' }, { status: 502 });
  }

  const { access_token, refresh_token, expires_in } = parsed.data;
  await saveTokens({
    access_token,
    refresh_token,
    expires_at: new Date(Date.now() + expires_in * 1000).toISOString(),
  });

  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.delete('monzo_oauth_state');
  return response;
}
