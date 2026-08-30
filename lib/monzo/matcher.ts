import type { Member } from '@/lib/league/members';
import { monzoTransactionDataSchema } from './schemas';

export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * A bank account's legal name and someone's FPL manager name can genuinely
 * differ — confirmed live: Alex's account sends "ALEXANDER MCGUINESS", not
 * the registered "Alex McGuiness". Resolved here as an explicit, known
 * synonym rather than by loosening the match itself (e.g. matching on first
 * name or surname alone), which would reopen the exact ambiguity full-name
 * matching exists to avoid — two Taylors, two McGuinesses.
 */
const NAME_ALIASES: Record<string, string> = {
  'alexander mcguiness': 'alex mcguiness',
};

function resolveAlias(normalized: string): string {
  return NAME_ALIASES[normalized] ?? normalized;
}

export interface EligibleCredit {
  txId: string;
  amountPence: number;
  counterpartyName: string;
}

/**
 * Filters out everything that isn't a genuine inbound credit, before any name
 * matching happens. Spec: "top-ups are positive with is_load: true; refunds
 * and reversals are positive with is_load: false; declined transactions carry
 * decline_reason."
 *
 * Odd amounts (not a £2-multiple) are deliberately NOT rejected here — they
 * pass through and the webhook route surfaces them in the pending queue as
 * 'unusual' for an admin to eyeball, rather than silently dropping a real
 * payment.
 */
export function extractEligibleCredit(data: unknown): EligibleCredit | null {
  const parsed = monzoTransactionDataSchema.safeParse(data);
  if (!parsed.success) return null;

  const tx = parsed.data;
  if (tx.amount <= 0) return null;
  if (tx.is_load) return null;
  if (tx.decline_reason) return null;
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
 *
 * `aliasedEntryId` is an admin-confirmed identity for this exact sender name
 * (from a prior "Approve" in the pending queue) — checked first, since it's
 * a stronger signal than any name comparison. Falls through to ordinary
 * matching if the aliased member is no longer in the current member list
 * (e.g. they've since left the league).
 */
export function matchSender(
  counterpartyName: string,
  members: Member[],
  aliasedEntryId?: number,
): SenderMatch {
  if (aliasedEntryId !== undefined) {
    const aliased = members.find((member) => member.entryId === aliasedEntryId);
    if (aliased) return { outcome: 'matched', member: aliased };
  }

  const target = resolveAlias(normalizeName(counterpartyName));
  const matches = members.filter((member) => normalizeName(member.managerName) === target);
  if (matches.length === 0) return { outcome: 'no-match' };
  if (matches.length > 1) return { outcome: 'ambiguous', members: matches };
  return { outcome: 'matched', member: matches[0] };
}
