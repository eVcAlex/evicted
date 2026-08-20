import { NextResponse } from 'next/server';
import { MONZO_API_BASE, monzoClientCredentials, monzoRedirectUri } from '@/lib/monzo/config';
import { monzoAccountsResponseSchema, monzoTokenResponseSchema } from '@/lib/monzo/schemas';
import { verifyState } from '@/lib/monzo/state';
import { saveTokens } from '@/lib/monzo/store';

/**
 * A completed OAuth exchange gets us a token, not a subscription — Monzo only
 * calls the webhook URL once something has explicitly registered it via
 * POST /webhooks. Doing that here, automatically, removes a step the admin
 * would otherwise have to trigger separately and easily forget.
 *
 * Not idempotent: re-running Connect Monzo registers a second webhook rather
 * than replacing the first. Acceptable for a single-admin hobby app during
 * the capture phase — listing and de-duplicating existing webhooks is real
 * scope, deliberately deferred until the matcher (the thing that actually
 * needs exactly-once delivery) is being built.
 */
async function registerWebhook(accessToken: string, webhookUrl: string): Promise<void> {
  const accountsRes = await fetch(`${MONZO_API_BASE}/accounts?account_type=uk_retail`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!accountsRes.ok) {
    throw new Error(`listing accounts failed: ${accountsRes.status} ${await accountsRes.text()}`);
  }

  const parsed = monzoAccountsResponseSchema.safeParse(await accountsRes.json());
  if (!parsed.success || parsed.data.accounts.length === 0) {
    throw new Error('no uk_retail account found to register the webhook against');
  }

  const accountId = parsed.data.accounts[0].id;

  const webhookRes = await fetch(`${MONZO_API_BASE}/webhooks`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ account_id: accountId, url: webhookUrl }),
  });
  if (!webhookRes.ok) {
    throw new Error(`registering webhook failed: ${webhookRes.status} ${await webhookRes.text()}`);
  }
}

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

  const redirectTarget = new URL('/balances', request.url);
  try {
    await registerWebhook(access_token, `${monzoRedirectUri().replace('/api/monzo/callback', '')}/api/monzo/webhook`);
    redirectTarget.searchParams.set('monzo', 'connected');
  } catch (error) {
    // Tokens are already saved, so the connection itself succeeded — only the
    // webhook subscription failed. Surfaced in the redirect rather than only
    // logged, since a silent failure here means "nothing ever arrives" with
    // no visible symptom until someone wonders why a payment never matched.
    console.error('registerWebhook failed', error);
    redirectTarget.searchParams.set('monzo', 'webhook_registration_failed');
  }

  const response = NextResponse.redirect(redirectTarget);
  response.cookies.delete('monzo_oauth_state');
  return response;
}
