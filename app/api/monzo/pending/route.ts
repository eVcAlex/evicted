import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPin } from '@/lib/admin';
import { dismissPending, getPending } from '@/lib/monzo/store';

/** Admin-only readback of credits the matcher couldn't auto-apply confidently. */
export async function GET(request: Request) {
  if (!checkPin(request.headers.get('x-admin-pin'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  try {
    return NextResponse.json({ pending: await getPending() });
  } catch (error) {
    console.error('getPending failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }
}

const bodySchema = z.object({ id: z.string() });

/** Dismisses one pending entry once an admin has resolved it manually. */
export async function DELETE(request: Request) {
  if (!checkPin(request.headers.get('x-admin-pin'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

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

  try {
    await dismissPending(parsed.data.id);
  } catch (error) {
    console.error('dismissPending failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
