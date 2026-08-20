import type { Bootstrap, EntryHistory } from '@/lib/fpl/schemas';
import { gameweeksNeedingRecord } from '@/lib/ledger/reconcile';
import { getResults, saveResult, type GameweekResult } from '@/lib/ledger/store';
import { settledGameweeks } from './gameweeks';
import { findLosers, scoresForGameweek } from './scoring';

/**
 * The lazy alternative to a cron. Any gameweek that has settled since the last
 * page view is computed and written now, oldest first. Already-recorded
 * gameweeks are never rewritten.
 */
export async function recordSettledGameweeks(params: {
  bootstrap: Bootstrap;
  histories: Map<number, EntryHistory>;
}): Promise<Map<number, GameweekResult>> {
  const { bootstrap, histories } = params;
  const results = await getResults();
  const pending = gameweeksNeedingRecord(settledGameweeks(bootstrap), results.keys());

  for (const gameweek of pending) {
    const scores = scoresForGameweek(histories, gameweek);
    if (scores.length === 0) continue;

    const result: GameweekResult = {
      losers: findLosers(scores),
      scores: Object.fromEntries(scores.map((s) => [s.entryId, s.net])),
      recordedAt: new Date().toISOString(),
    };

    // `saveResult` refuses to overwrite a gameweek that is already recorded.
    // Only reflect the new result locally if it was actually persisted, so the
    // page never renders a result the store did not accept.
    if (await saveResult(gameweek, result)) {
      results.set(gameweek, result);
    }
  }

  return results;
}
