import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody, withAdminAuth } from '@/lib/api/guards';
import { fetchStandings } from '@/lib/fpl/client';
import { resolveMembers } from '@/lib/league/members';
import { applyPayment } from '@/lib/monzo/apply';
import { normalizeName } from '@/lib/monzo/matcher';
import { dismissPending, getPending, saveAlias } from '@/lib/monzo/store';

/** Admin-only readback of credits the matcher couldn't auto-apply confidently. */
export const GET = withAdminAuth(async () => {
  try {
    return NextResponse.json({ pending: await getPending() });
  } catch (error) {
    console.error('getPending failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }
});

const approveSchema = z.object({ id: z.string(), entryId: z.number().int().positive() });

/**
 * Attributes a pending credit to a specific member, applies it if they
 * currently owe that many gameweeks, and — unlike a one-off dismiss —
 * remembers the sender name so future credits from it auto-apply without
 * revisiting the queue.
 */
export const POST = withAdminAuth(async (request) => {
  const parsed = await parseJsonBody(request, approveSchema);
  if (!parsed.ok) return parsed.response;
  const { id, entryId } = parsed.data;

  try {
    const pending = await getPending();
    const entry = pending.find((p) => p.id === id);
    if (!entry) {
      return NextResponse.json({ error: 'not found, it may already be resolved' }, { status: 404 });
    }

    const standings = await fetchStandings(0);
    const members = resolveMembers(standings);
    const result = await applyPayment({
      entryId,
      amountPence: entry.amountPence,
      txId: entry.id,
      receivedAt: entry.receivedAt,
      members,
    });

    // Apply first, then commit the side effects. A refusal leaves the card in
    // the queue (so the admin can retry once the store recovers) and teaches
    // the aliaser nothing — an alias learned from a payment that never landed
    // would silently auto-apply the sender's next one to the same member.
    if (!result.applied) {
      return NextResponse.json({ error: result.reason }, { status: 503 });
    }

    // A re-queued reversal has a synthetic counterparty; don't teach the
    // aliaser that string.
    if (!entry.id.startsWith('reversed:')) {
      await saveAlias(normalizeName(entry.counterpartyName), entryId);
    }

    await dismissPending(id);

    return NextResponse.json({ ok: true, ...result.allocation });
  } catch (error) {
    console.error('approve pending failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }
});

const bodySchema = z.object({ id: z.string() });

/** Dismisses one pending entry once an admin has resolved it manually. */
export const DELETE = withAdminAuth(async (request) => {
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    await dismissPending(parsed.data.id);
  } catch (error) {
    console.error('dismissPending failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
});
