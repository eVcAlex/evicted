import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/api/guards';
import { getPayments } from '@/lib/ledger/store';

export const GET = withAdminAuth(async () => {
  try {
    return NextResponse.json({ payments: await getPayments() });
  } catch (error) {
    console.error('getPayments failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }
});
