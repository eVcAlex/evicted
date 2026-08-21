import type { EntryHistory } from '@/lib/fpl/schemas';
import { isEligible } from './eligibility';

export interface GameweekScore {
  entryId: number;
  gross: number;
  hits: number;
  net: number;
  /** Points left unused on the bench — not part of `net`, only ever quip fodder. */
  bench: number;
}

/**
 * Net score for every manager who played the given gameweek *as a member of
 * this league*.
 *
 * Two separate exclusions apply. A manager with no entry for the gameweek is
 * omitted rather than scored as zero. A manager who had not yet joined the
 * league is omitted even when their FPL history covers the gameweek — see
 * `eligibility.ts`; `history.current[]` starts at their first FPL gameweek, not
 * their first gameweek here.
 *
 * `eligibleFrom` is optional: omitting it applies no membership restriction.
 */
export function scoresForGameweek(
  histories: Map<number, EntryHistory>,
  gameweek: number,
  eligibleFrom?: Map<number, number>,
): GameweekScore[] {
  const scores: GameweekScore[] = [];

  for (const [entryId, history] of histories) {
    if (!isEligible(eligibleFrom, entryId, gameweek)) continue;

    const entry = history.current.find((e) => e.event === gameweek);
    if (!entry) continue;

    scores.push({
      entryId,
      gross: entry.points,
      hits: entry.event_transfers_cost,
      net: entry.points - entry.event_transfers_cost,
      bench: entry.points_on_bench,
    });
  }

  return scores;
}

/**
 * The entry ids of every manager tied at the lowest net score.
 *
 * Ties are deliberately not broken — everyone level at the bottom pays. This
 * is the single place that rule lives; changing it is a one-function edit.
 */
export function findLosers(scores: GameweekScore[]): number[] {
  if (scores.length === 0) return [];

  const lowest = Math.min(...scores.map((s) => s.net));
  return scores.filter((s) => s.net === lowest).map((s) => s.entryId);
}
