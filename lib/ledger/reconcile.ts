/**
 * Which settled gameweeks still need a result written, oldest first.
 *
 * Ordering matters: if nobody opens the site for a month, several gameweeks
 * settle at once and must be recorded in the order they were played.
 */
export function gameweeksNeedingRecord(
  settled: number[],
  recorded: Iterable<number>,
): number[] {
  const already = new Set(recorded);
  return settled.filter((gw) => !already.has(gw)).sort((a, b) => a - b);
}
