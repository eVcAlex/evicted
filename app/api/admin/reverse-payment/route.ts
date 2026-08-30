import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody, withAdminAuth } from '@/lib/api/guards';
import { fetchStandings } from '@/lib/fpl/client';
import { resolveMembers } from '@/lib/league/members';
import { reversePayment } from '@/lib/ledger/reverse';

const bodySchema = z.object({ paymentId: z.string() });

export const POST = withAdminAuth(async (request) => {
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const members = resolveMembers(await fetchStandings(0));
    const result = await reversePayment(parsed.data.paymentId, members);
    if (!result.ok) {
      // 'store error' is a transient Redis failure the caller should retry;
      // the rest ('not found', 'already reversed', …) are the request's fault.
      const status = result.reason === 'store error' ? 503 : 400;
      return NextResponse.json({ error: result.reason }, { status });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('reverse-payment failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }
});
