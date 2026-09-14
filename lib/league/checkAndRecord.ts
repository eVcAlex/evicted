import { after } from 'next/server';
import { fetchHistory } from '@/lib/fpl/client';
import type { Bootstrap, EntryHistory } from '@/lib/fpl/schemas';
import { reconcileCredit } from '@/lib/ledger/credit';
import { safeRecordSettledGameweeks } from '@/lib/ledger/safe';
import type { GameweekResult } from '@/lib/ledger/store';
import type { Member } from './members';

/** Recording must not read the render path's cache entry — see below. */
const REVALIDATE_FOR_RECORDING = 0;

export async function loadHistories(
  members: Member[],
  revalidate: number,
): Promise<Map<number, EntryHistory>> {
  return new Map(
    await Promise.all(
      members.map(
        async (member) =>
          [member.entryId, await fetchHistory(member.entryId, revalidate)] as const,
      ),
    ),
  );
}

/**
 * Records any newly-settled gameweek, then chases credit for it via `after()`
 * — scheduled to run once the response has been sent, so nobody's own page
 * load waits on four Redis reads and writes on everyone else's behalf.
 *
 * Shared by the home page (lazy: whichever visit happens first after a
 * gameweek settles) and the scheduled `/api/cron/check-settled` check. Both
 * funnel through the same `saveResult` HSETNX, so there is no risk of
 * double-recording if a real visitor and the scheduled check land at once.
 */
export async function checkAndRecordSettled(params: {
  bootstrap: Bootstrap;
  members: Member[];
  eligibleFrom: Map<number, number>;
}): Promise<{ results: Map<number, GameweekResult>; degraded: boolean }> {
  const { bootstrap, members, eligibleFrom } = params;

  const { results, degraded } = await safeRecordSettledGameweeks({
    bootstrap,
    members,
    eligibleFrom,
    fetchHistories: () => loadHistories(members, REVALIDATE_FOR_RECORDING),
  });

  after(async () => {
    // Unconditional, not gated on whether this tick recorded anything: if the
    // tick that recorded a fine ran while a store was degraded,
    // `reconcileCredit` bailed (correctly) and every later tick has nothing
    // newly recorded — the gameweek is already HSETNX'd — so the money
    // invariant would stay broken until the next fine, or forever after the
    // last gameweek. It early-continues per member and costs nothing when
    // there is nothing to chase, which turns the cron into a real
    // self-healing loop. Scheduled, so no page render waits on its reads and
    // writes.
    await reconcileCredit(members).catch((error) =>
      console.error('reconcileCredit failed', error),
    );
  });

  return { results, degraded };
}
