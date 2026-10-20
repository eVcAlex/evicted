import { cache } from 'react';
import { fetchStandings } from '@/lib/fpl/client';
import { safeGetResults } from '@/lib/ledger/safe';
import { isTruncatedLeague, resolveMembers } from './members';

/**
 * True when FPL's standings look truncated (see `isTruncatedLeague`). The
 * classic pages redirect home and the nav greys out while this holds, so no
 * screen shows a partial league as if it were the whole one.
 *
 * Cached per request so the layout and the page share one check. An FPL or
 * store failure reads as "not broken": those already have their own error
 * states, and blocking the whole app on a flaky check would be worse.
 */
export const leagueIsBroken = cache(async (): Promise<boolean> => {
  try {
    const [standings, { results }] = await Promise.all([fetchStandings(60), safeGetResults()]);
    return isTruncatedLeague(resolveMembers(standings), results);
  } catch {
    return false;
  }
});
