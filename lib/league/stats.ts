import type { GridResult } from '@/lib/gameweekResult';
import type { Identity } from '@/lib/identity';
import { lossesByEntry } from './history';

export interface HallOfShame {
  /** Everyone tied on the highest eviction count, and what that count is. */
  mostEvictions: { members: Identity[]; count: number } | null;
  /** The single lowest net score ever recorded, and who posted it. */
  worst: { member: Identity; gameweek: number; net: number } | null;
  /** Most consecutive *recorded* gameweeks a manager has avoided the bottom. */
  longestCleanRun: { member: Identity; weeks: number } | null;
}

/**
 * Season-long stats derived entirely from the recorded ledger — no extra FPL
 * fetches. A manager who has left the league (and so is missing from
 * `members`) is dropped from every stat here rather than resurrected as a
 * stub; `balances.ts` does that resurrection where it matters (their debt
 * outlives their membership), but a hall-of-shame entry for someone nobody
 * can identify any more is just noise.
 */
export function buildHallOfShame(params: {
  members: Identity[];
  results: Map<number, GridResult>;
}): HallOfShame {
  const { members, results } = params;
  const byEntryId = new Map(members.map((m) => [m.entryId, m]));

  return {
    mostEvictions: mostEvictions(byEntryId, results),
    worst: worstSingleScore(byEntryId, results),
    longestCleanRun: longestCleanRun(members, results),
  };
}

function mostEvictions(
  byEntryId: Map<number, Identity>,
  results: Map<number, GridResult>,
): HallOfShame['mostEvictions'] {
  const losses = lossesByEntry(results);
  let count = 0;
  for (const gameweeks of losses.values()) {
    count = Math.max(count, gameweeks.length);
  }
  if (count === 0) return null;

  const tied = [...losses.entries()]
    .filter(([, gameweeks]) => gameweeks.length === count)
    .flatMap(([entryId]) => byEntryId.get(entryId) ?? []);

  return tied.length > 0 ? { members: tied, count } : null;
}

function worstSingleScore(
  byEntryId: Map<number, Identity>,
  results: Map<number, GridResult>,
): HallOfShame['worst'] {
  let worst: HallOfShame['worst'] = null;

  for (const [gameweek, result] of results) {
    for (const entryId of result.losers) {
      const net = result.scores[entryId];
      const member = byEntryId.get(entryId);
      if (net === undefined || !member) continue;
      if (!worst || net < worst.net) {
        worst = { member, gameweek, net };
      }
    }
  }

  return worst;
}

function longestCleanRun(
  members: Identity[],
  results: Map<number, GridResult>,
): HallOfShame['longestCleanRun'] {
  const gameweeksDesc = [...results.keys()].sort((a, b) => b - a);
  if (gameweeksDesc.length === 0) return null;

  let best: HallOfShame['longestCleanRun'] = null;

  for (const member of members) {
    let weeks = 0;
    for (const gameweek of gameweeksDesc) {
      const result = results.get(gameweek)!;
      // Not yet a member that gameweek: skip it without breaking the streak.
      if (!(member.entryId in result.scores)) continue;
      if (result.losers.includes(member.entryId)) break;
      weeks += 1;
    }
    if (weeks > 0 && (!best || weeks > best.weeks)) {
      best = { member, weeks };
    }
  }

  return best;
}
