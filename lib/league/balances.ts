import { BUYIN_PENCE, FINE_PENCE } from '@/lib/config';
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
  /** Raw credit balance in pence; negative = overdrawn. 0 for departed members. */
  creditPence: number;
  /** They owe money but are no longer in the league standings. */
  departed: boolean;
  /**
   * Still owes the season's one-off buy-in — folded into `owedPence`/
   * `paidPence` alongside fine debt. Always `false` for a departed member:
   * their debt is only ever fine debt, never a retroactive buy-in.
   */
  buyinOwed: boolean;
}

/**
 * A stand-in for someone who has left the league. Their debt outlives their
 * membership, but the standings we resolve names from no longer mention them,
 * so all we have left is the entry id.
 */
function departedMember(entryId: number): Member {
  return {
    entryId,
    managerName: '',
    teamName: `Entry ${entryId}`,
    joinedTime: null,
  };
}

export function buildBalances(params: {
  members: Member[];
  results: Map<number, GameweekResult>;
  paid: Set<string>;
  buyins: Set<number>;
  credit?: Map<number, number>;
}): Balance[] {
  const { members, results, paid, buyins } = params;
  const credit = params.credit ?? new Map<number, number>();

  const byEntryId = new Map(members.map((member) => [member.entryId, member]));

  // Leaving the league does not clear the debt. Iterating the live standings
  // alone silently dropped anyone who had left, taking their unpaid gameweeks
  // to zero. Only `losers` can carry debt, so an entry that appears solely in a
  // gameweek's `scores` is not resurrected as an empty row.
  const departed = new Set<number>();
  for (const result of results.values()) {
    for (const entryId of result.losers) {
      if (byEntryId.has(entryId)) continue;
      departed.add(entryId);
      byEntryId.set(entryId, departedMember(entryId));
    }
  }

  return [...byEntryId.values()]
    .map((member) => {
      const lost = [...results.entries()]
        .filter(([, result]) => result.losers.includes(member.entryId))
        .map(([gameweek]) => gameweek)
        .sort((a, b) => a - b);

      const unpaid = lost.filter((gw) => !paid.has(paidKey(gw, member.entryId)));
      const isDeparted = departed.has(member.entryId);
      const buyinOwed = !isDeparted && !buyins.has(member.entryId);
      const creditPence = isDeparted ? 0 : (credit.get(member.entryId) ?? 0);
      const grossOwed = unpaid.length * FINE_PENCE + (buyinOwed ? BUYIN_PENCE : 0);

      return {
        member,
        lost,
        unpaid,
        buyinOwed,
        creditPence,
        owedPence: grossOwed - creditPence,
        paidPence:
          (lost.length - unpaid.length) * FINE_PENCE + (!isDeparted && !buyinOwed ? BUYIN_PENCE : 0),
        departed: isDeparted,
      };
    })
    .sort((a, b) => b.owedPence - a.owedPence);
}
