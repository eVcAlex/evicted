import { FINE_PENCE } from '@/lib/config';
import { paidKey, type GameweekResult } from '@/lib/ledger/store';
import type { Member } from './members';

export interface Balance {
  member: Member;
  /** Gameweeks this manager finished bottom of. */
  lost: number[];
  /** Of those, the ones still unpaid. */
  unpaid: number[];
  owedPence: number;
  paidPence: number;
}

export function buildBalances(params: {
  members: Member[];
  results: Map<number, GameweekResult>;
  paid: Set<string>;
}): Balance[] {
  const { members, results, paid } = params;

  return members
    .map((member) => {
      const lost = [...results.entries()]
        .filter(([, result]) => result.losers.includes(member.entryId))
        .map(([gameweek]) => gameweek)
        .sort((a, b) => a - b);

      const unpaid = lost.filter((gw) => !paid.has(paidKey(gw, member.entryId)));

      return {
        member,
        lost,
        unpaid,
        owedPence: unpaid.length * FINE_PENCE,
        paidPence: (lost.length - unpaid.length) * FINE_PENCE,
      };
    })
    .sort((a, b) => b.owedPence - a.owedPence);
}
