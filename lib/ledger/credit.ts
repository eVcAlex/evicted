import { randomUUID } from 'node:crypto';
import { affordableFines, fineFor } from './fines';
import { buildBalances } from '@/lib/league/balances';
import type { Member } from '@/lib/league/members';
import { safeGetBuyins, safeGetCredit, safeGetPaid, safeGetResults } from './safe';
import { appendPayment, setCredit, setPaid } from './store';

/**
 * Restores the waterfall invariant (`credit > 0` ⟹ no unpaid fines) by
 * spending any member's banked credit on their unpaid fines, oldest first.
 * Called after a gameweek is recorded — a new fine against someone holding
 * credit should land already paid. Never touches the buy-in (spec §5).
 *
 * Each member's writes are independent; one failing is logged and the rest
 * proceed.
 */
export async function reconcileCredit(members: Member[]): Promise<void> {
  const [paidState, resultsState, buyinsState, creditState] = await Promise.all([
    safeGetPaid(),
    safeGetResults(),
    safeGetBuyins(),
    safeGetCredit(),
  ]);

  // A degraded getter falls back to an empty set/map. Spending real credit
  // against that fallback would clear fines that a partial outage merely hid —
  // money out of the pot for nothing. Do nothing until every store is healthy.
  if (
    paidState.degraded ||
    resultsState.degraded ||
    buyinsState.degraded ||
    creditState.degraded
  ) {
    console.warn('reconcileCredit skipped: a ledger store is degraded');
    return;
  }

  const balances = buildBalances({
    members,
    results: resultsState.results,
    paid: paidState.paid,
    buyins: buyinsState.buyins,
    credit: creditState.credit,
  });

  for (const balance of balances) {
    if (balance.departed || balance.creditPence <= 0 || balance.unpaid.length === 0) continue;

    const entryIdForFines = balance.member.entryId;
    const covered = affordableFines(balance.creditPence, balance.unpaid, (gw) =>
      fineFor(resultsState.results.get(gw), entryIdForFines),
    );
    const fineGameweeks = covered.gameweeks;
    if (fineGameweeks.length === 0) continue;

    const spent = covered.spentPence;
    const entryId = balance.member.entryId;

    try {
      await Promise.all(fineGameweeks.map((gw) => setPaid(gw, entryId, true)));
      await setCredit(entryId, balance.creditPence - spent);
      await appendPayment({
        id: `chase:${randomUUID()}`,
        entryId,
        amountPence: 0,
        source: 'credit-chase',
        receivedAt: new Date().toISOString(),
        allocation: { fineGameweeks, buyin: false, creditDeltaPence: -spent },
      });
    } catch (error) {
      console.error('reconcileCredit failed for entry', entryId, error);
    }
  }
}
