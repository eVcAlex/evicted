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

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const { gameweek, entryId, paid } = parsed.data;
  await setPaid(gameweek, entryId, paid);

  return NextResponse.json({ ok: true });
}
