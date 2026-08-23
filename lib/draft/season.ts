import type { GridResult } from '@/lib/gameweekResult';
import type { DraftMember } from './members';
import { findBottom, pointsForGameweek } from './scoring';
import type { DraftEntryHistory } from './schemas';

/**
 * The in-memory replacement for the classic app's Redis ledger. Draft has
 * nothing worth persisting — `/entry/{id}/history` already returns a whole
 * season in one call, so this just recomputes the same `GridResult` shape
 * the ledger would have produced, fresh on every render.
 *
 * Applies the same completeness guard as `lib/league/record.ts`: a
 * gameweek is skipped entirely (not partially scored) if any member is
 * missing a score for it, so a fetch hiccup can never crown the wrong
 * person bottom. Unlike the ledger, skipping costs nothing here — there's
 * no permanent wrong record, just a `console.warn` and a self-healing
 * retry on the next render.
 */
export function buildSeasonResults(params: {
  histories: Map<number, DraftEntryHistory>;
  gameweeks: number[];
  members: DraftMember[];
}): Map<number, GridResult> {
  const { histories, gameweeks, members } = params;
  const results = new Map<number, GridResult>();

  for (const gameweek of gameweeks) {
    const scores = pointsForGameweek(histories, gameweek);
    const scored = new Set(scores.map((s) => s.entryId));
    const missing = members.filter((m) => m.teamId !== null && !scored.has(m.entryId));

    if (missing.length > 0) {
      console.warn(
        `Skipping draft gameweek ${gameweek}: no score for ${missing
          .map((m) => m.teamName)
          .join(', ')}`,
      );
      continue;
    }

    results.set(gameweek, {
      losers: findBottom(scores),
      scores: Object.fromEntries(scores.map((s) => [s.entryId, s.points])),
    });
  }

  return results;
}
