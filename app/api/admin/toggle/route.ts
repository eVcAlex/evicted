import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPin } from '@/lib/admin';
import { setPaid } from '@/lib/ledger/store';

const bodySchema = z.object({
  gameweek: z.number().int().min(1).max(38),
  entryId: z.number().int().positive(),
  paid: z.boolean(),
});

export async function POST(request: Request) {
  if (!checkPin(request.headers.get('x-admin-pin'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  // An unparseable body is the caller's fault, not a server fault. Left
  // unguarded it threw, which the client could only read as a 500 — and the
  // client used to treat any non-200 as a rejected PIN.
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const { gameweek, entryId, paid } = parsed.data;

  try {
    await setPaid(gameweek, entryId, paid);
  } catch (error) {
    // The store is unreachable. Say so with a status the client will not
    // mistake for a wrong PIN.
    console.error('setPaid failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
