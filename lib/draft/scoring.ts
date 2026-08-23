import type { DraftEntryHistory } from './schemas';

export interface DraftScore {
  entryId: number;
  points: number;
  /** Points left unused on the bench — quip fodder only, same as classic. */
  bench: number;
  /** Transfer count that gameweek. Draft has no transfer *cost*, so this is
   *  never subtracted from `points` — quip fodder only. */
  transfers: number;
}

/**
 * Points for every manager who has a history entry for the given gameweek.
 * `histories` is keyed by `DraftMember.entryId` (the league-entry id), not
 * `teamId` — the fetch layer does that translation once so nothing here has
 * to think about it. No `hits`/`net` split: draft has no transfer costs, so
 * a score is just the points FPL awarded.
 */
export function pointsForGameweek(
  histories: Map<number, DraftEntryHistory>,
  gameweek: number,
): DraftScore[] {
  const scores: DraftScore[] = [];

  for (const [entryId, history] of histories) {
    const row = history.history.find((h) => h.event === gameweek);
    if (!row) continue;

    scores.push({
      entryId,
      points: row.points,
      bench: row.points_on_bench,
      transfers: row.event_transfers,
    });
  }

  return scores;
}

/**
 * The entry ids of every manager tied at the lowest score. Ties are
 * deliberately not broken — same rule as classic's `findLosers`, kept in
 * sync on purpose.
 */
export function findBottom(scores: DraftScore[]): number[] {
  if (scores.length === 0) return [];

  const lowest = Math.min(...scores.map((s) => s.points));
  return scores.filter((s) => s.points === lowest).map((s) => s.entryId);
}
