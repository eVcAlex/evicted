import { FINE_PENCE } from '@/lib/config';
import type { Member } from '@/lib/league/members';
import { monzoTransactionDataSchema } from './schemas';

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export interface EligibleCredit {
  txId: string;
  amountPence: number;
  counterpartyName: string;
}

/**
 * Everything that isn't even a candidate £2-multiple credit is filtered here,
 * before any name matching happens. Spec: "top-ups are positive with
 * is_load: true; refunds and reversals are positive with is_load: false;
 * declined transactions carry decline_reason."
 */
export function extractEligibleCredit(data: unknown): EligibleCredit | null {
  const parsed = monzoTransactionDataSchema.safeParse(data);
  if (!parsed.success) return null;

  const tx = parsed.data;
  if (tx.amount <= 0) return null;
  if (tx.is_load) return null;
  if (tx.decline_reason) return null;
  if (tx.amount % FINE_PENCE !== 0) return null;
  if (!tx.counterparty?.name) return null;

  return { txId: tx.id, amountPence: tx.amount, counterpartyName: tx.counterparty.name };
}

export type SenderMatch =
  | { outcome: 'matched'; member: Member }
  | { outcome: 'no-match' }
  | { outcome: 'ambiguous'; members: Member[] };

/**
 * Matches on the sender's full name, not surname — the league has two
 * Taylors and two McGuinesses, so surname alone can't attribute a payment.
 * Case-insensitive: a real captured payload showed Monzo sending inbound
 * counterparty names in caps ("ALEXANDER MCGUINESS") but outbound ones in
 * title case, so an exact-case compare would miss real matches.
 */
export function matchSender(counterpartyName: string, members: Member[]): SenderMatch {
  const target = normalizeName(counterpartyName);
  const matches = members.filter((member) => normalizeName(member.managerName) === target);
  if (matches.length === 0) return { outcome: 'no-match' };
  if (matches.length > 1) return { outcome: 'ambiguous', members: matches };
  return { outcome: 'matched', member: matches[0] };
}

export interface ApplyPlan {
  entryId: number;
  /** Oldest-first, exactly `amountPence / FINE_PENCE` of them. */
  gameweeks: number[];
}

/**
 * Only plans an application when the credit exactly covers whole gameweeks
 * the member actually owes, and never more than they have unpaid. A credit
 * that overshoots — paid more than they owe, or owes nothing at all — is left
 * for manual review rather than guessed at.
 */
export function planApplication(params: {
  entryId: number;
  amountPence: number;
  unpaid: number[];
}): ApplyPlan | null {
  const { entryId, amountPence, unpaid } = params;
  const count = amountPence / FINE_PENCE;
  if (!Number.isInteger(count) || count <= 0 || count > unpaid.length) return null;
  return { entryId, gameweeks: unpaid.slice(0, count) };
}
