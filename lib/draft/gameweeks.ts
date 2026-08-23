import type { DraftBootstrap, DraftEvent, DraftGame, DraftLeagueMeta } from './schemas';

export const REVALIDATE_LIVE = 60;
export const REVALIDATE_SETTLED = 3600;

/**
 * Draft has no `data_checked` field — the classic signal for "bonus points
 * and auto-subs are in, this score will not change again." The closest
 * substitute is `average_entry_score`: both it and `highest_scoring_entry`
 * are null on every unplayed event, consistent with them being written by
 * the same post-gameweek aggregation job that applies bonus/auto-subs. This
 * is a heuristic, not confirmed against a real completed gameweek — because
 * nothing here is persisted (unlike the classic ledger), a wrong call
 * self-heals on the next render instead of writing a wrong record forever.
 */
export function isSettled(event: DraftEvent): boolean {
  return event.finished && event.average_entry_score !== null;
}

/** Gameweeks whose results are final, bounded to this league's actual run. */
export function settledGameweeks(bootstrap: DraftBootstrap, league: DraftLeagueMeta): number[] {
  return bootstrap.events.data
    .filter(
      (e) => isSettled(e) && e.id >= league.start_event && e.id <= league.stop_event,
    )
    .map((e) => e.id)
    .sort((a, b) => a - b);
}

export function currentGameweek(bootstrap: DraftBootstrap): DraftEvent | null {
  const { current } = bootstrap.events;
  if (current === null) return null;
  return bootstrap.events.data.find((e) => e.id === current) ?? null;
}

export function nextGameweek(bootstrap: DraftBootstrap): DraftEvent | null {
  const { next } = bootstrap.events;
  if (next === null) return null;
  return bootstrap.events.data.find((e) => e.id === next) ?? null;
}

/**
 * Poll hard only while scores are actually moving. Reads the cheap `/game`
 * endpoint rather than the bootstrap itself, so the revalidate decision
 * doesn't require downloading the ~1MB payload it's about to gate.
 */
export function revalidateForGame(game: DraftGame): number {
  return game.current_event_finished ? REVALIDATE_SETTLED : REVALIDATE_LIVE;
}
