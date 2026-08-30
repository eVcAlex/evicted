import type { DraftLeagueMeta } from './schemas';

/**
 * Whether this league's draft has been played — the gate between the
 * "Nobody yet" preseason screen and the live standings table.
 *
 * Reads `league.drafts`, not `league.draft_status`: the live FPL Draft API
 * leaves `draft_status` at `'pre'` even after the draft completes (confirmed
 * against league 77196 on 2026-08-30). A completed `drafts[]` entry is the
 * signal that actually flips.
 */
export function isDraftLive(league: DraftLeagueMeta): boolean {
  return league.drafts.some((draft) => draft.draft_completed !== null);
}
