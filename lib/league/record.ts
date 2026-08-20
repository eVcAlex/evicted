import type { Bootstrap, EntryHistory } from '@/lib/fpl/schemas';
import { gameweeksNeedingRecord } from '@/lib/ledger/reconcile';
import { getResults, saveResult, type GameweekResult } from '@/lib/ledger/store';
import { isEligible } from './eligibility';
import { settledGameweeks } from './gameweeks';
import type { Member } from './members';
import { findLosers, scoresForGameweek } from './scoring';

export interface RecordParams {
  bootstrap: Bootstrap;
  /** Everyone currently in the league, from the standings we just fetched. */
  members: Member[];
  /** First gameweek each member is liable for — see `eligibility.ts`. */
  eligibleFrom: Map<number, number>;
  /**
   * Histories fetched *for recording*, not for rendering.
   *
   * Called only when there is actually something to record, and expected to
   * bypass the render path's cache. The `data_checked` gate is read from
   * `bootstrap`, but net scores come from `histories`, which is a separate
   * fetch with its own cache entry: a history response cached during the live
   * window is pre-bonus and pre-auto-sub, and `revalidateFor` backs off to an
   * hour the instant `data_checked` flips. Writing from that entry would put
   * exactly the provisional numbers `data_checked` exists to exclude into a
   * permanent row.
   */
  fetchHistories: () => Promise<Map<number, EntryHistory>>;
}

/**
 * The lazy alternative to a cron. Any gameweek that has settled since the last
 * page view is computed and written now, oldest first. Already-recorded
 * gameweeks are never rewritten.
 */
export async function recordSettledGameweeks(
  params: RecordParams,
): Promise<Map<number, GameweekResult>> {
  const { bootstrap, members, eligibleFrom, fetchHistories } = params;

  const results = await getResults();
  const pending = gameweeksNeedingRecord(settledGameweeks(bootstrap), results.keys());

  // Nothing to record: do not pay for a second round of history fetches on
  // every page load just to leave the store exactly as we found it.
  if (pending.length === 0) return results;

  const histories = await fetchHistories();

  for (const gameweek of pending) {
    // Who *should* have a score, derived from the members list rather than from
    // the scores themselves. Deriving it from the scores would make a failed
    // `fetchHistory` invisible — the missing manager would simply not be
    // considered, and the wrong person would be fined, permanently.
    const expected = members.filter((member) =>
      isEligible(eligibleFrom, member.entryId, gameweek),
    );
    if (expected.length === 0) continue;

    const scores = scoresForGameweek(histories, gameweek, eligibleFrom);
    const scored = new Set(scores.map((score) => score.entryId));
    const missing = expected
      .filter((member) => !scored.has(member.entryId))
      .map((member) => member.entryId);

    if (missing.length > 0) {
      // Refusing leaves the gameweek unrecorded until a later page load has
      // complete data. That is the safe direction: `saveResult` uses HSETNX, so
      // a row written from partial data could never be corrected by the app.
      console.warn(
        `Refusing to record gameweek ${gameweek}: no score for ${missing.join(', ')}`,
      );
      continue;
    }

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
