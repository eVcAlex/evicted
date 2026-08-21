import type { GameweekResult } from '@/lib/ledger/store';

/**
 * Every recorded gameweek each entry finished bottom of, ascending, keyed by
 * entry id. Shared by anything that needs a manager's loss history —
 * quips ("second week running") and the season hall-of-shame stats both read
 * from the same recorded ledger, so this is the one place that walks it.
 */
export function lossesByEntry(results: Map<number, GameweekResult>): Map<number, number[]> {
  const byEntry = new Map<number, number[]>();

  const gameweeksAscending = [...results.entries()].sort(([a], [b]) => a - b);
  for (const [gameweek, result] of gameweeksAscending) {
    for (const entryId of result.losers) {
      const existing = byEntry.get(entryId);
      if (existing) {
        existing.push(gameweek);
      } else {
        byEntry.set(entryId, [gameweek]);
      }
    }
  }

  return byEntry;
}
