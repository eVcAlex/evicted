import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/api/guards';
import { getCapturedPayloads, getPending, getTokens, type MonzoStatus } from '@/lib/monzo/store';

export const GET = withAdminAuth(async () => {
  try {
    const [tokens, captured, pending] = await Promise.all([
      getTokens(),
      getCapturedPayloads(),
      getPending(),
    ]);
    const payload: MonzoStatus = {
      connected: tokens !== null,
      expiresAt: tokens?.expires_at ?? null,
      capturedCount: captured.length,
      pendingCount: pending.length,
    };
    return NextResponse.json(payload);
  } catch (error) {
    console.error('monzo status failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }
});
