import {
  recordSettledGameweeks,
  type NewlyRecordedGameweek,
  type RecordParams,
} from '@/lib/league/record';
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

/**
 * Recording reads and writes the store, so it fails exactly when the store is
 * unreachable — including when no credentials are configured at all, where
 * `Redis.fromEnv()` yields a client that throws on its first command.
 *
 * Spec §6: "Redis unavailable — the gameweek view still renders from FPL data
 * alone; payment state degrades to unknown." An uncaught throw here escapes the
 * server component and replaces the whole page with the FPL error boundary,
 * which blames the wrong system.
 */
export async function safeRecordSettledGameweeks(params: RecordParams): Promise<{
  results: Map<number, GameweekResult>;
  newlyRecorded: NewlyRecordedGameweek[];
  degraded: boolean;
}> {
  try {
    const { results, newlyRecorded } = await recordSettledGameweeks(params);
    return { results, newlyRecorded, degraded: false };
  } catch (error) {
    console.error('safeRecordSettledGameweeks failed', error);
    return { results: new Map(), newlyRecorded: [], degraded: true };
  }
}
