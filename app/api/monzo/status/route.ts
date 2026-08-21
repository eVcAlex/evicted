import { NextResponse } from 'next/server';
import { checkPin } from '@/lib/admin';
import { getCapturedPayloads, getPending, getTokens } from '@/lib/monzo/store';

export async function GET(request: Request) {
  if (!checkPin(request.headers.get('x-admin-pin'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  try {
    const [tokens, captured, pending] = await Promise.all([
      getTokens(),
      getCapturedPayloads(),
      getPending(),
    ]);
    return NextResponse.json({
      connected: tokens !== null,
      expiresAt: tokens?.expires_at ?? null,
      capturedCount: captured.length,
      pendingCount: pending.length,
    });
  } catch (error) {
    console.error('monzo status failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }
}
