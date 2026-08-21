export interface QuipContext {
  gameweek: number;
  net: number;
  gross: number;
  hits: number;
  bench: number;
  /** Second-lowest net score this gameweek; `null` when everyone is level. */
  runnerUpNet: number | null;
  /** More than one manager tied at the bottom this gameweek. */
  tied: boolean;
  /** Gameweeks this entry has already finished bottom of, most recent last. */
  previousLosses: number[];
}

const ORDINALS = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh'];

function ordinal(n: number): string {
  return ORDINALS[n] ?? `${n}th`;
}

/**
 * A pool of context-free lines, cycled by gameweek rather than randomised.
 * `Math.random()` in a server component would pick a different line on every
 * request — including the two renders React does for the same page — so the
 * card would visibly change its own mind. Indexing by gameweek is stable
 * across reloads and still varies week to week.
 */
const FALLBACKS = [
  'Bottom of nine, this week.',
  'Somebody had to be here.',
  'The table has a floor. This is it.',
  'No excuses on record.',
];

/**
 * Picks the single most specific true fact about why this manager finished
 * bottom, in the voice the rest of the app already uses: state it, stop.
 *
 * Ordered predicates, first match wins — a tie is always more specific than a
 * fallback line, so it is checked first, and generic facts (the pool) are
 * checked last.
 */
export function quipFor(context: QuipContext): string {
  const { gameweek, net, gross, hits, bench, runnerUpNet, tied, previousLosses } = context;

  if (tied) return 'Level at the bottom. Everyone pays.';

  const margin = runnerUpNet !== null ? runnerUpNet - net : null;

  if (hits > 0 && margin !== null && gross - runnerUpNet! > 0) {
    return `Paid ${hits} point${hits === 1 ? '' : 's'} in hits to finish bottom.`;
  }

  if (bench > net) {
    return `Their bench outscored their team by ${bench - net}.`;
  }

  if (previousLosses.includes(gameweek - 1)) {
    // `streak` starts at 1 for this gameweek itself, then counts backward
    // through consecutive prior losses.
    let streak = 1;
    let week = gameweek - 1;
    while (previousLosses.includes(week)) {
      streak += 1;
      week -= 1;
    }
    return streak === 2 ? 'Second week running.' : `${streak} weeks running.`;
  }

  if (previousLosses.length >= 2) {
    return `${ordinal(previousLosses.length + 1)} eviction of the season.`.replace(
      /^./,
      (c) => c.toUpperCase(),
    );
  }

  if (margin === 1) return 'One point off safety.';
  if (margin !== null && margin >= 15) return `Bottom by ${margin}. Not a photo finish.`;
  if (net <= 20) return `${net} points from eleven players.`;

  return FALLBACKS[gameweek % FALLBACKS.length];
}
