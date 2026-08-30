import { buildBalances } from '@/lib/league/balances';
import type { Member } from '@/lib/league/members';
import { safeGetBuyins, safeGetCredit, safeGetPaid, safeGetResults } from '@/lib/ledger/safe';
import { appendPayment, setBuyin, setCredit, setPaid } from '@/lib/ledger/store';
import { planWaterfall, type PaymentAllocation } from '@/lib/ledger/waterfall';

/**
 * Applies one incoming payment for a known member: pays their oldest unpaid
 * fines, flips the buy-in if a full £20 is covered, and banks any remainder
 * as credit. The single entry point for both the webhook auto-apply path and
 * the pending-queue Approve action, so both obey the same waterfall.
 *
 * Persistence spans four Redis keys with no transaction; a mid-write failure
 * is logged, not thrown — the caller (a webhook ack or an admin click) must
 * not 500, and the payment log / balances make the inconsistency visible.
 */
export async function applyPayment(params: {
  entryId: number;
  amountPence: number;
  txId: string;
  receivedAt: string;
  members: Member[];
}): Promise<PaymentAllocation> {
  const { entryId, amountPence, txId, receivedAt, members } = params;

  const [{ paid }, { results }, { buyins }, { credit }] = await Promise.all([
    safeGetPaid(),
    safeGetResults(),
    safeGetBuyins(),
    safeGetCredit(),
  ]);

  const balances = buildBalances({ members, results, paid, buyins, credit });
  const mine = balances.find((b) => b.member.entryId === entryId);
  const creditPence = mine?.creditPence ?? 0;

  const allocation = planWaterfall({
    amountPence,
    unpaidFines: mine?.unpaid ?? [],
    buyinPaid: !(mine?.buyinOwed ?? false),
    creditPence,
  });

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
  }

  return allocation;
}
