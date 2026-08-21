import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPin } from '@/lib/admin';
import { fetchStandings } from '@/lib/fpl/client';
import { resolveMembers } from '@/lib/league/members';
import { applyIfOwed } from '@/lib/monzo/apply';
import { normalizeName } from '@/lib/monzo/matcher';
import { dismissPending, getPending, saveAlias } from '@/lib/monzo/store';

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

const approveSchema = z.object({ id: z.string(), entryId: z.number().int().positive() });

/**
 * Attributes a pending credit to a specific member, applies it if they
 * currently owe that many gameweeks, and — unlike a one-off dismiss —
 * remembers the sender name so future credits from it auto-apply without
 * revisiting the queue.
 */
export async function POST(request: Request) {
  if (!checkPin(request.headers.get('x-admin-pin'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }
  const { id, entryId } = parsed.data;

  try {
    const pending = await getPending();
    const entry = pending.find((p) => p.id === id);
    if (!entry) {
      return NextResponse.json({ error: 'not found — it may already be resolved' }, { status: 404 });
    }

    await saveAlias(normalizeName(entry.counterpartyName), entryId);

    const standings = await fetchStandings(0);
    const members = resolveMembers(standings);
    const result = await applyIfOwed({ entryId, amountPence: entry.amountPence, members });

    await dismissPending(id);

    return NextResponse.json({ ok: true, applied: result.applied, gameweeks: result.gameweeks });
  } catch (error) {
    console.error('approve pending failed', error);
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
