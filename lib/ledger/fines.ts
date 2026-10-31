import { CHIP_FINE_PENCE, FINE_PENCE } from '@/lib/config';

/** What `entryId` owes for finishing bottom of this recorded gameweek. */
export function fineFor(
  result: { chipLosers?: number[] } | undefined,
  entryId: number,
): number {
  return result?.chipLosers?.includes(entryId) ? CHIP_FINE_PENCE : FINE_PENCE;
}

/**
 * How many of `gameweeks` (oldest first) a pool can pay in full, stopping at
 * the first one it can't afford so payments always clear the oldest fines first.
 */
export function affordableFines(
  pool: number,
  gameweeks: number[],
  penceFor: (gameweek: number) => number,
): { gameweeks: number[]; spentPence: number } {
  const covered: number[] = [];
  let spentPence = 0;
  for (const gw of gameweeks) {
    const pence = penceFor(gw);
    if (spentPence + pence > pool) break;
    spentPence += pence;
    covered.push(gw);
  }
  return { gameweeks: covered, spentPence };
}
