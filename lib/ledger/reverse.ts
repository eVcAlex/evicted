import type { Member } from '@/lib/league/members';
import { appendPending } from '@/lib/monzo/store';
import { appendPayment, getCredit, getPayments, setBuyin, setCredit, setPaid } from './store';

/**
 * Undoes one webhook payment's allocation: un-pays its fine gameweeks and
 * buy-in, and subtracts its credit delta from the current balance — which
 * may go negative ("overdrawn"). No cascade: a later credit-chase that spent
 * this payment's banked credit is left alone for the admin (spec §8, Q15a).
 * Re-queues a 'reversed' pending entry so the payment can be re-attributed.
 *
 * The original Monzo txId stays in the SEEN set — reversal makes the payment
 * re-attributable, not un-received, and re-adding it would let a redelivery
 * double-apply.
 *
 * Every read happens inside the `try`, on the *raw* store: `setCredit` is an
 * absolute write derived from the balance read here, so a degraded read that
 * quietly returned an empty map would write `0 − delta` over a real balance
 * and invent an overdraft. A store failure must refuse the whole reversal,
 * not proceed on a fallback. Nothing escapes as a throw either — the route
 * surfaces `{ ok: false }` as a 503.
 */
export async function reversePayment(
  paymentId: string,
  members: Member[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const now = new Date().toISOString();

  try {
    const payments = await getPayments();
    const entry = payments.find((p) => p.id === paymentId);
    if (!entry) return { ok: false, reason: 'not found' };
    if (entry.source !== 'monzo') {
      return { ok: false, reason: 'only webhook payments can be reversed' };
    }
    // The reversal id is deterministic (`reversal:<originalId>`) precisely so
    // this guard works — see `PaymentLogEntry`.
    if (payments.some((p) => p.id === `reversal:${entry.id}`)) {
      return { ok: false, reason: 'already reversed' };
    }

    const credit = await getCredit();
    const current = credit.get(entry.entryId) ?? 0;
    const { fineGameweeks, buyin, creditDeltaPence } = entry.allocation;
    const teamName =
      members.find((m) => m.entryId === entry.entryId)?.teamName ?? `Entry ${entry.entryId}`;

    await Promise.all([
      ...fineGameweeks.map((gw) => setPaid(gw, entry.entryId, false)),
      ...(buyin ? [setBuyin(entry.entryId, false)] : []),
      ...(creditDeltaPence !== 0 ? [setCredit(entry.entryId, current - creditDeltaPence)] : []),
    ]);
    await appendPayment({
      id: `reversal:${entry.id}`,
      entryId: entry.entryId,
      amountPence: entry.amountPence,
      source: 'reversal',
      receivedAt: now,
      allocation: { fineGameweeks, buyin, creditDeltaPence: -creditDeltaPence },
    });
    await appendPending({
      id: `reversed:${entry.id}`,
      receivedAt: now,
      amountPence: entry.amountPence,
      counterpartyName: `${teamName} (reversed)`,
      reason: 'reversed',
      candidates: [{ entryId: entry.entryId, teamName }],
    });
  } catch (error) {
    console.error('reversePayment failed', paymentId, error);
    return { ok: false, reason: 'store error' };
  }

  return { ok: true };
}
