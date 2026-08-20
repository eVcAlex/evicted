import type { Bootstrap, GameweekEvent } from '@/lib/fpl/schemas';

export const REVALIDATE_LIVE = 60;
export const REVALIDATE_SETTLED = 3600;

/**
 * Gameweeks whose results are final.
 *
 * `finished` alone is not enough: bonus points and auto-substitutions land
 * afterwards, and they move the bottom of the table. Only `data_checked`
 * means the score will not change again.
 */
export function settledGameweeks(bootstrap: Bootstrap): number[] {
  return bootstrap.events
    .filter((e) => e.finished && e.data_checked)
    .map((e) => e.id)
    .sort((a, b) => a - b);
}

export function currentGameweek(bootstrap: Bootstrap): GameweekEvent | null {
  return bootstrap.events.find((e) => e.is_current) ?? null;
}

export function nextGameweek(bootstrap: Bootstrap): GameweekEvent | null {
  return bootstrap.events.find((e) => e.is_next) ?? null;
}

/** Poll hard only while scores are actually moving. */
export function revalidateFor(bootstrap: Bootstrap): number {
  const current = currentGameweek(bootstrap);
  if (!current) return REVALIDATE_SETTLED;
  return current.data_checked ? REVALIDATE_SETTLED : REVALIDATE_LIVE;
}
