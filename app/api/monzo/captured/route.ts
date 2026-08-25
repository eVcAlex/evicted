import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/api/guards';
import { getCapturedPayloads } from '@/lib/monzo/store';

/** Admin-only readback of captured webhook payloads. Capture-phase tooling only. */
export const GET = withAdminAuth(async () => {
  try {
    return NextResponse.json({ payloads: await getCapturedPayloads() });
  } catch (error) {
    console.error('getCapturedPayloads failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }
});
