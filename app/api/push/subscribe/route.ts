import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody } from '@/lib/api/guards';
import { removeSubscription, saveSubscription } from '@/lib/push/store';

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
  entryId: z.number().int().positive().nullable().optional(),
});

const deleteSchema = z.object({ endpoint: z.string().url() });

/**
 * No admin PIN: opting a device in or out of notifications is a personal
 * preference, not a money-affecting write — the same distinction the app
 * already draws for `AdminToggle` vs the paid-status endpoint.
 */
export async function POST(request: Request) {
  const parsed = await parseJsonBody(request, subscriptionSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await saveSubscription(parsed.data);
  } catch (error) {
    console.error('saveSubscription failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const parsed = await parseJsonBody(request, deleteSchema);
  if (!parsed.ok) return parsed.response;

  try {
    await removeSubscription(parsed.data.endpoint);
  } catch (error) {
    console.error('removeSubscription failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
