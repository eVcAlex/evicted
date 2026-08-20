import { NextResponse } from 'next/server';
import { monzoWebhookEnvelopeSchema } from '@/lib/monzo/schemas';
import { appendCapturedPayload } from '@/lib/monzo/store';

/**
 * Capture phase only — logs the raw payload and does nothing else.
 *
 * Monzo does not sign webhook payloads, so this endpoint cannot verify a
 * request actually came from Monzo. That is fine right now: the only effect
 * of a request here is an entry in a bounded, admin-only capture log. It
 * becomes a real concern once this endpoint drives money-affecting logic,
 * at which point verification (or rotating this URL to an unguessable path)
 * needs solving before the matcher ships — tracked, not solved, here.
 *
 * Spec §5: "Non-matching events are discarded immediately and never logged."
 * That rule starts applying once matching exists. Until then, capturing
 * everything is the point — it is how the real `counterparty` shape gets
 * observed instead of guessed.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const parsed = monzoWebhookEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  try {
    await appendCapturedPayload(parsed.data);
  } catch (error) {
    console.error('appendCapturedPayload failed', error);
    // Monzo retries on non-2xx. A store outage is ours to fix, not Monzo's
    // problem to retry into — still ack so it doesn't hammer the endpoint.
  }

  return NextResponse.json({ ok: true });
}
