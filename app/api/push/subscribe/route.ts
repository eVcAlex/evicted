import { NextResponse } from 'next/server';
import { z } from 'zod';
import { removeSubscription, saveSubscription } from '@/lib/push/store';

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

const deleteSchema = z.object({ endpoint: z.string().url() });

/**
 * No admin PIN: opting a device in or out of notifications is a personal
 * preference, not a money-affecting write — the same distinction the app
 * already draws for `AdminToggle` vs the paid-status endpoint.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const parsed = subscriptionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  try {
    await saveSubscription(parsed.data);
  } catch (error) {
    console.error('saveSubscription failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const parsed = deleteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  try {
    await removeSubscription(parsed.data.endpoint);
  } catch (error) {
    console.error('removeSubscription failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
