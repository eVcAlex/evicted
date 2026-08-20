import { NextResponse } from 'next/server';
import { checkPin } from '@/lib/admin';
import { monzoRedirectUri } from '@/lib/monzo/config';
import { getTokens } from '@/lib/monzo/store';
import { registerWebhook } from '@/lib/monzo/webhook';

export async function POST(request: Request) {
  if (!checkPin(request.headers.get('x-admin-pin'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const tokens = await getTokens();
  if (!tokens) {
    return NextResponse.json({ error: 'not connected — click Connect Monzo first' }, { status: 409 });
  }

  try {
    const webhookUrl = `${monzoRedirectUri().replace('/api/monzo/callback', '')}/api/monzo/webhook`;
    await registerWebhook(tokens.access_token, webhookUrl);
  } catch (error) {
    console.error('registerWebhook failed', error);
    const message = error instanceof Error ? error.message : 'unknown error';
    // 403 forbidden.insufficient_permissions here almost always means Strong
    // Customer Authentication hasn't been confirmed in the Monzo app yet —
    // surfaced verbatim so that's diagnosable from the response alone.
    return NextResponse.json({ error: message }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
