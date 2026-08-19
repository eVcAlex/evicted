import type { EntryHistory } from '@/lib/fpl/schemas';

export interface GameweekScore {
  entryId: number;
  gross: number;
  hits: number;
  net: number;
}

/**
 * Net score for every manager who played the given gameweek.
 *
 * Managers absent from a gameweek are omitted rather than scored as zero: a
 * manager who joined the league in GW10 is not liable for GW1 to GW9.
 */
export function scoresForGameweek(
  histories: Map<number, EntryHistory>,
  gameweek: number,
): GameweekScore[] {
  const scores: GameweekScore[] = [];

  for (const [entryId, history] of histories) {
    const entry = history.current.find((e) => e.event === gameweek);
    if (!entry) continue;

    scores.push({
      entryId,
      gross: entry.points,
      hits: entry.event_transfers_cost,
      net: entry.points - entry.event_transfers_cost,
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
