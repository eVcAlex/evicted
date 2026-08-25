import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/api/guards';
import { getTokens } from '@/lib/monzo/store';
import { registerWebhook } from '@/lib/monzo/webhook';

export const POST = withAdminAuth(async (request) => {
  let tokens;
  try {
    tokens = await getTokens();
  } catch (error) {
    console.error('getTokens failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }

  if (!tokens) {
    return NextResponse.json({ error: 'not connected — click Connect Monzo first' }, { status: 409 });
  }

  try {
    // Derived from the request's own origin, not MONZO_REDIRECT_BASE_URL
    // (which is only the OAuth callback's base) — so this always registers
    // against whichever host you're actually on, production or a preview,
    // with no extra per-environment config.
    const webhookUrl = `${new URL(request.url).origin}/api/monzo/webhook`;
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
});
