import { NextResponse } from 'next/server';
import { checkPin } from '@/lib/admin';
import { getCapturedPayloads } from '@/lib/monzo/store';

/** Admin-only readback of captured webhook payloads. Capture-phase tooling only. */
export async function GET(request: Request) {
  if (!checkPin(request.headers.get('x-admin-pin'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  try {
    return NextResponse.json({ payloads: await getCapturedPayloads() });
  } catch (error) {
    console.error('getCapturedPayloads failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }
}
