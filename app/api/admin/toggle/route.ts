import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody, withAdminAuth } from '@/lib/api/guards';
import { setPaid } from '@/lib/ledger/store';

const bodySchema = z.object({
  gameweek: z.number().int().min(1).max(38),
  entryId: z.number().int().positive(),
  paid: z.boolean(),
});

export const POST = withAdminAuth(async (request) => {
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { gameweek, entryId, paid } = parsed.data;

  try {
    await setPaid(gameweek, entryId, paid);
  } catch (error) {
    // The store is unreachable. Say so with a status the client will not
    // mistake for a 401 (a session that is not a valid admin session).
    console.error('setPaid failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
});
