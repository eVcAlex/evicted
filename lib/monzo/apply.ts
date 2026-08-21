import { buildBalances } from '@/lib/league/balances';
import type { Member } from '@/lib/league/members';
import { safeGetPaid, safeGetResults } from '@/lib/ledger/safe';
import { setPaid } from '@/lib/ledger/store';
import { planApplication } from './matcher';

export interface ApplyResult {
  applied: boolean;
  gameweeks: number[];
}

/**
 * Marks a credit's worth of gameweeks paid for a known member, if — and only
 * if — they currently have that many unpaid. Shared by the webhook's
 * auto-apply path and the pending queue's "Approve" action, so both go
 * through the exact same "never apply more than is owed" rule
 * (`planApplication`). Takes `members` rather than fetching standings itself
 * — the caller already has a current member list by the time it needs this.
 */
export async function applyIfOwed(params: {
  entryId: number;
  amountPence: number;
  members: Member[];
}): Promise<ApplyResult> {
  const { members } = params;
  const [{ paid }, { results }] = await Promise.all([safeGetPaid(), safeGetResults()]);
  const balances = buildBalances({ members, results, paid });
  const unpaid = balances.find((b) => b.member.entryId === params.entryId)?.unpaid ?? [];

  const plan = planApplication({ entryId: params.entryId, amountPence: params.amountPence, unpaid });
  if (!plan) return { applied: false, gameweeks: [] };

  try {
    await Promise.all(plan.gameweeks.map((gameweek) => setPaid(gameweek, plan.entryId, true)));
  } catch (error) {
    console.error('setPaid failed during Monzo matching', error);
  }
  return { applied: true, gameweeks: plan.gameweeks };
}
