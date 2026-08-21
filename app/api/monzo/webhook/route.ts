import { NextResponse } from 'next/server';
import { fetchStandings } from '@/lib/fpl/client';
import { buildBalances } from '@/lib/league/balances';
import { resolveMembers } from '@/lib/league/members';
import { safeGetPaid, safeGetResults } from '@/lib/ledger/safe';
import { setPaid } from '@/lib/ledger/store';
import { extractEligibleCredit, matchSender, planApplication } from '@/lib/monzo/matcher';
import { monzoWebhookEnvelopeSchema } from '@/lib/monzo/schemas';
import {
  appendCapturedPayload,
  appendPending,
  markTransactionSeen,
  type PendingMatch,
} from '@/lib/monzo/store';

/**
 * Money-affecting, so the member list must be current — a stale cache could
 * miss someone who joined mid-season or match a name that has since left.
 */
const REVALIDATE_FOR_MATCHING = 0;

/**
 * Monzo does not sign webhook payloads, so this endpoint cannot verify a
 * request actually came from Monzo. Acceptable here because every write this
 * endpoint can trigger is bounded and reversible (marking specific gameweeks
 * paid for a real league member who genuinely has that debt outstanding) and
 * the admin-visible capture log and pending queue make any bad write easy to
 * spot and undo via the existing balances toggle.
 *
 * Always acks 200: Monzo retries on non-2xx, and a store outage or FPL blip
 * here is ours to fix, not Monzo's problem to retry into.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const parsed = monzoWebhookEnvelopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  try {
    await appendCapturedPayload(parsed.data);
  } catch (error) {
    console.error('appendCapturedPayload failed', error);
  }

  const credit = extractEligibleCredit(parsed.data.data);
  if (!credit) return NextResponse.json({ ok: true });

  let isNewTransaction: boolean;
  try {
    isNewTransaction = await markTransactionSeen(credit.txId);
  } catch (error) {
    // Can't dedupe safely — bail rather than risk double-applying a match
    // from one of Monzo's several redeliveries of the same transaction.
    console.error('markTransactionSeen failed', error);
    return NextResponse.json({ ok: true });
  }
  if (!isNewTransaction) return NextResponse.json({ ok: true });

  let members;
  try {
    const standings = await fetchStandings(REVALIDATE_FOR_MATCHING);
    members = resolveMembers(standings);
  } catch (error) {
    // The raw payload is still in the capture log for manual reconciliation.
    console.error('fetchStandings failed during Monzo matching', error);
    return NextResponse.json({ ok: true });
  }

  const match = matchSender(credit.counterpartyName, members);

  if (match.outcome === 'no-match') {
    // Not applied *or* dropped: a bank account's legal name and someone's FPL
    // manager name can genuinely differ (e.g. "ALEXANDER MCGUINESS" vs "Alex
    // McGuiness") — that's still a real payment from a real member, just one
    // full-name matching can't attribute on its own. A human glancing at the
    // queue can, which is the whole reason it exists.
    await queuePending({
      id: credit.txId,
      receivedAt: new Date().toISOString(),
      amountPence: credit.amountPence,
      counterpartyName: credit.counterpartyName,
      reason: 'no-match',
      candidates: [],
    });
    return NextResponse.json({ ok: true });
  }

  if (match.outcome === 'ambiguous') {
    await queuePending({
      id: credit.txId,
      receivedAt: new Date().toISOString(),
      amountPence: credit.amountPence,
      counterpartyName: credit.counterpartyName,
      reason: 'ambiguous',
      candidates: match.members.map((member) => member.teamName),
    });
    return NextResponse.json({ ok: true });
  }

  const [{ paid }, { results }] = await Promise.all([safeGetPaid(), safeGetResults()]);
  const balances = buildBalances({ members, results, paid });
  const unpaid = balances.find((b) => b.member.entryId === match.member.entryId)?.unpaid ?? [];

  const plan = planApplication({
    entryId: match.member.entryId,
    amountPence: credit.amountPence,
    unpaid,
  });

  if (!plan) {
    await queuePending({
      id: credit.txId,
      receivedAt: new Date().toISOString(),
      amountPence: credit.amountPence,
      counterpartyName: credit.counterpartyName,
      reason: 'no-debt',
      candidates: [match.member.teamName],
    });
    return NextResponse.json({ ok: true });
  }

  try {
    await Promise.all(plan.gameweeks.map((gameweek) => setPaid(gameweek, plan.entryId, true)));
  } catch (error) {
    console.error('setPaid failed during Monzo matching', error);
  }

  return NextResponse.json({ ok: true });
}

async function queuePending(entry: PendingMatch): Promise<void> {
  try {
    await appendPending(entry);
  } catch (error) {
    console.error('appendPending failed', error);
  }
}
