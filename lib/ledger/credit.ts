import { randomUUID } from 'node:crypto';
import { FINE_PENCE } from '@/lib/config';
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
  const [{ paid }, { results }, { buyins }, { credit }] = await Promise.all([
    safeGetPaid(),
    safeGetResults(),
    safeGetBuyins(),
    safeGetCredit(),
  ]);

  const balances = buildBalances({ members, results, paid, buyins, credit });

  for (const balance of balances) {
    if (balance.departed || balance.creditPence <= 0 || balance.unpaid.length === 0) continue;

    const affordable = Math.floor(balance.creditPence / FINE_PENCE);
    const fineGameweeks = balance.unpaid.slice(0, affordable);
    if (fineGameweeks.length === 0) continue;

    const spent = fineGameweeks.length * FINE_PENCE;
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
