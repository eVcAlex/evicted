import type { GridResult } from '@/lib/gameweekResult';

export interface FormPoint {
  gameweek: number;
  net: number;
}

/**
 * An entry's net score across the most recent *recorded* gameweeks strictly
 * before `beforeGameweek`, oldest first. Feeds the loser card's trend
 * sparkline — real settled history, not the live/provisional gameweek being
 * shown, which is why the caller appends that one itself (see `LoserCard`).
 *
 * A gameweek the entry didn't play (not yet a member, or missing from the
 * ledger) is skipped rather than treated as zero, matching how the rest of
 * `lib/league` reads this map (`lossesByEntry`, `stats.ts`).
 */
export function recentForm(
  results: Map<number, GridResult>,
  entryId: number,
  beforeGameweek: number,
  limit = 5,
): FormPoint[] {
  const points: FormPoint[] = [];

  for (const [gameweek, result] of results) {
    if (gameweek >= beforeGameweek) continue;
    const net = result.scores[entryId];
    if (net === undefined) continue;
    points.push({ gameweek, net });
  }

  points.sort((a, b) => a.gameweek - b.gameweek);
  return points.slice(-limit);
}
