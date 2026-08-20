import { getPaid, getResults, type GameweekResult } from './store';

/**
 * An unreachable store degrades to "we don't know", never to "settled".
 * Showing a fine as paid when it isn't would take real money out of the pot.
 *
 * The error is logged (not swallowed silently) so an infrastructure outage
 * and a genuine code defect in `getPaid`/`getResults` don't look identical
 * from the outside — both degrade the same way for the reader, but only one
 * of them should page someone.
 */
export async function safeGetPaid(): Promise<{ paid: Set<string>; degraded: boolean }> {
  try {
    return { paid: await getPaid(), degraded: false };
  } catch (error) {
    console.error('safeGetPaid failed', error);
    return { paid: new Set(), degraded: true };
  }
}

export async function safeGetResults(): Promise<{
  results: Map<number, GameweekResult>;
  degraded: boolean;
}> {
  try {
    return { results: await getResults(), degraded: false };
  } catch (error) {
    console.error('safeGetResults failed', error);
    return { results: new Map(), degraded: true };
  }
}
