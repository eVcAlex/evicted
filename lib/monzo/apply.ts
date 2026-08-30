import { buildBalances } from '@/lib/league/balances';
import type { Member } from '@/lib/league/members';
import {
  safeGetBuyins,
  safeGetCredit,
  safeGetPaid,
  safeGetPayments,
  safeGetResults,
} from '@/lib/ledger/safe';
import { appendPayment, setBuyin, setCredit, setPaid } from '@/lib/ledger/store';
import { planWaterfall, type PaymentAllocation } from '@/lib/ledger/waterfall';

export type ApplyPaymentResult =
  | { applied: true; allocation: PaymentAllocation }
  | { applied: false; reason: string };

/**
 * Applies one incoming payment for a known member: pays their oldest unpaid
 * fines, flips the buy-in if a full £20 is covered, and banks any remainder
 * as credit. The single entry point for both the webhook auto-apply path and
 * the pending-queue Approve action, so both obey the same waterfall.
 *
 * Never throws and never half-reports: every refusal comes back as
 * `{ applied: false, reason }` so the caller can decide what to do with money
 * that has already left someone's account (queue it, or 503 and keep the card).
 *
 * Persistence spans four Redis keys with no transaction; a mid-write failure
 * is logged, not thrown — the caller (a webhook ack or an admin click) must
 * not 500, and the payment log / balances make the inconsistency visible.
 * `appendPayment` is deliberately LAST: `planWaterfall` re-derives the whole
 * allocation from live state, so a retry after a partial write converges, and
 * the audit entry only appearing on full success is what lets the replay guard
 * below tell a completed payment from a partially-applied one.
 */
export async function applyPayment(params: {
  entryId: number;
  amountPence: number;
  txId: string;
  receivedAt: string;
  members: Member[];
}): Promise<ApplyPaymentResult> {
  const { entryId, amountPence, txId, receivedAt, members } = params;

  const [paidState, resultsState, buyinsState, creditState, paymentsState] = await Promise.all([
    safeGetPaid(),
    safeGetResults(),
    safeGetBuyins(),
    safeGetCredit(),
    safeGetPayments(),
  ]);

  // A degraded getter falls back to an empty set/map, which reads as "owes
  // everything, holds nothing". Planning against that consumes a real payment
  // against fines that are already paid and banks nothing — the money is gone
  // and the log records an allocation that never happened. Refuse to write.
  if (
    paidState.degraded ||
    resultsState.degraded ||
    buyinsState.degraded ||
    creditState.degraded ||
    paymentsState.degraded
  ) {
    console.warn('applyPayment skipped: a ledger store is degraded', { txId, entryId });
    return { applied: false, reason: 'ledger degraded' };
  }

  // Replay guard. `setCredit` is an absolute write computed from a freshly-read
  // balance, so re-running a completed payment would bank the remainder twice.
  // A logged audit entry means the whole sequence finished; report its
  // allocation so a retried Approve behaves exactly like the first one.
  const logged = paymentsState.payments.find((p) => p.id === txId);
  if (logged) return { applied: true, allocation: logged.allocation };

  const balances = buildBalances({
    members,
    results: resultsState.results,
    paid: paidState.paid,
    buyins: buyinsState.buyins,
    credit: creditState.credit,
  });

  // `buildBalances` only yields rows for current members plus departed members
  // carrying losses. Writing credit for anything else puts money in a key
  // nothing reads: invisible on /balances and absent from the pot.
  const mine = balances.find((b) => b.member.entryId === entryId);
  if (!mine) return { applied: false, reason: 'unknown member' };

  const creditPence = mine.creditPence;

  const planned = planWaterfall({
    amountPence,
    unpaidFines: mine.unpaid,
    buyinPaid: !mine.buyinOwed,
    creditPence,
  });

  // A departed member's `creditPence` is masked to 0 by `buildBalances` and
  // their row is skipped by the pot, so credit banked for them would simply
  // vanish from every view. Pay the fines, drop the remainder, say so loudly.
  let allocation = planned;
  if (mine.departed && planned.creditDeltaPence !== 0) {
    console.warn('applyPayment: dropping overpayment remainder for departed member', {
      entryId,
      txId,
      droppedPence: planned.creditDeltaPence,
    });
    allocation = { ...planned, creditDeltaPence: 0 };
  }

  try {
    await Promise.all([
      ...allocation.fineGameweeks.map((gw) => setPaid(gw, entryId, true)),
      ...(allocation.buyin ? [setBuyin(entryId, true)] : []),
      ...(allocation.creditDeltaPence !== 0
        ? [setCredit(entryId, creditPence + allocation.creditDeltaPence)]
        : []),
    ]);
    await appendPayment({ id: txId, entryId, amountPence, source: 'monzo', receivedAt, allocation });
  } catch (error) {
    console.error('applyPayment failed to persist', { txId, entryId, error });
    return { applied: false, reason: 'partial write' };
  }

  return { applied: true, allocation };
}
