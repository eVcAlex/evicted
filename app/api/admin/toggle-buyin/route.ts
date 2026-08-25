import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody, withAdminAuth } from '@/lib/api/guards';
import { setBuyin } from '@/lib/ledger/store';

const bodySchema = z.object({
  entryId: z.number().int().positive(),
  paid: z.boolean(),
});

export const POST = withAdminAuth(async (request) => {
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;
  const { entryId, paid } = parsed.data;

  try {
    await setBuyin(entryId, paid);
  } catch (error) {
    console.error('setBuyin failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
});
