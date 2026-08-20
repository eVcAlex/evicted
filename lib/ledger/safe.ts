import { getPaid, getResults, type GameweekResult } from './store';

/**
 * An unreachable store degrades to "we don't know", never to "settled".
 * Showing a fine as paid when it isn't would take real money out of the pot.
 */
export async function safeGetPaid(): Promise<{ paid: Set<string>; degraded: boolean }> {
  try {
    return { paid: await getPaid(), degraded: false };
  } catch {
    return { paid: new Set(), degraded: true };
  }
}

export async function safeGetResults(): Promise<{
  results: Map<number, GameweekResult>;
  degraded: boolean;
}> {
  try {
    return { results: await getResults(), degraded: false };
  } catch {
    return { results: new Map(), degraded: true };
  }
}
