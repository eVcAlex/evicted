import { NextResponse } from 'next/server';
import { parseJsonBody } from '@/lib/api/guards';
import { FINE_PENCE, WEBHOOK_AUTO_APPLY_CAP_PENCE } from '@/lib/config';
import { fetchStandings } from '@/lib/fpl/client';
import { resolveMembers } from '@/lib/league/members';
import { applyPayment } from '@/lib/monzo/apply';
import { extractEligibleCredit, matchSender, normalizeName } from '@/lib/monzo/matcher';
import { monzoWebhookEnvelopeSchema } from '@/lib/monzo/schemas';
import {
  appendCapturedPayload,
  appendPending,
  getAliases,
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
  const parsed = await parseJsonBody(request, monzoWebhookEnvelopeSchema);
  if (!parsed.ok) return parsed.response;

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

  let aliasedEntryId: number | undefined;
  try {
    const aliases = await getAliases();
    aliasedEntryId = aliases[normalizeName(credit.counterpartyName)];
  } catch (error) {
    console.error('getAliases failed', error);
  }

  const match = matchSender(credit.counterpartyName, members, aliasedEntryId);
  const now = new Date().toISOString();

  if (match.outcome === 'no-match') {
    // Not applied *or* dropped: a bank account's legal name and someone's FPL
    // manager name can genuinely differ (e.g. "ALEXANDER MCGUINESS" vs "Alex
    // McGuiness") — that's still a real payment from a real member, just one
    // full-name matching can't attribute on its own. A human glancing at the
    // queue can, which is the whole reason it exists.
    await queuePending({
      id: credit.txId, receivedAt: now, amountPence: credit.amountPence,
      counterpartyName: credit.counterpartyName, reason: 'no-match', candidates: [],
    });
    return NextResponse.json({ ok: true });
  }

  if (match.outcome === 'ambiguous') {
    await queuePending({
      id: credit.txId, receivedAt: now, amountPence: credit.amountPence,
      counterpartyName: credit.counterpartyName, reason: 'ambiguous',
      candidates: match.members.map((m) => ({ entryId: m.entryId, teamName: m.teamName })),
    });
    return NextResponse.json({ ok: true });
  }

  // Name resolves cleanly to one member; the amount check only flags an
  // otherwise-clean single match. The cap gates *unattended* auto-apply only —
  // a larger or non-£2-multiple payment is still real, it just wants a human.
  const isUnusual =
    credit.amountPence > WEBHOOK_AUTO_APPLY_CAP_PENCE || credit.amountPence % FINE_PENCE !== 0;

  if (isUnusual) {
    await queuePending({
      id: credit.txId, receivedAt: now, amountPence: credit.amountPence,
      counterpartyName: credit.counterpartyName, reason: 'unusual',
      candidates: [{ entryId: match.member.entryId, teamName: match.member.teamName }],
    });
    return NextResponse.json({ ok: true });
  }

  try {
    await applyPayment({
      entryId: match.member.entryId,
      amountPence: credit.amountPence,
      txId: credit.txId,
      receivedAt: now,
      members,
    });
  } catch (error) {
    console.error('applyPayment failed during Monzo matching', error);
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
