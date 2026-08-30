import { BUYIN_PENCE, FINE_PENCE } from '@/lib/config';

export interface PaymentAllocation {
  /** Unpaid fine gameweeks this payment covers, oldest first. */
  fineGameweeks: number[];
  /** Whether this payment flips the (binary) season buy-in to paid. */
  buyin: boolean;
  /** Signed change to the member's credit balance: + banked, − spent. */
  creditDeltaPence: number;
}

/**
 * Splits one incoming payment. See
 * `docs/superpowers/specs/2026-08-30-buyin-credit-ledger-design.md` §4.
 *
 * Only the positive part of an existing credit balance is spendable — a
 * negative balance (a post-reversal overdraft) is left for the admin, not
 * quietly repaired by the next payment.
 */
export function planWaterfall(params: {
  amountPence: number;
  unpaidFines: number[];
  buyinPaid: boolean;
  creditPence: number;
}): PaymentAllocation {
  const { amountPence, unpaidFines, buyinPaid, creditPence } = params;

  let pool = amountPence + Math.max(creditPence, 0);

  const affordableFines = Math.floor(pool / FINE_PENCE);
  const fineGameweeks = unpaidFines.slice(0, affordableFines);
  pool -= fineGameweeks.length * FINE_PENCE;

  const buyin = !buyinPaid && pool >= BUYIN_PENCE;
  if (buyin) pool -= BUYIN_PENCE;

  const newCreditBalance = Math.min(creditPence, 0) + pool;
  return { fineGameweeks, buyin, creditDeltaPence: newCreditBalance - creditPence };
}
