import type { GridResult } from '@/lib/gameweekResult';
import type { DraftMember } from './members';
import type { DraftEntryHistory } from './schemas';

export interface DraftAwards {
  /** Highest single-gameweek score of the season, and who posted it. */
  bestWeek: { member: DraftMember; gameweek: number; points: number } | null;
  /** Most total bench points left unused across the season. */
  benchWaste: { member: DraftMember; points: number } | null;
  /** Most total points scored across the season. */
  mostPoints: { member: DraftMember; points: number } | null;
  /** The single biggest gap between the bottom score and the next one up. */
  mostAdrift: { member: DraftMember; gameweek: number; margin: number } | null;
  /** The smallest such gap — whoever avoided the bottom by the least. */
  narrowestEscape: {
    escaped: DraftMember;
    bottom: DraftMember;
    gameweek: number;
    margin: number;
  } | null;
  /** Most transfers made across the season. */
  busiest: { member: DraftMember; transfers: number } | null;
}

/**
 * The "Wrapped-style recap" extras classic can't produce: it only persists
 * net scores in its ledger, but draft's `history[]` carries a whole season
 * of bench/transfer detail in memory already, at no extra fetch cost. Scoped
 * to `results`' settled gameweeks throughout, so a still-live gameweek never
 * skews a season-long award.
 */
export function buildDraftAwards(params: {
  members: DraftMember[];
  histories: Map<number, DraftEntryHistory>;
  results: Map<number, GridResult>;
}): DraftAwards {
  const { members, histories, results } = params;
  const byEntryId = new Map(members.map((m) => [m.entryId, m]));
  const settled = new Set(results.keys());

  const benchTotals = seasonTotals(histories, settled, (row) => row.points_on_bench);
  const pointTotals = seasonTotals(histories, settled, (row) => row.points);
  const transferTotals = seasonTotals(histories, settled, (row) => row.event_transfers);

  return {
    bestWeek: bestWeek(byEntryId, results),
    benchWaste: highest(byEntryId, benchTotals, (points) => ({ points })),
    mostPoints: highest(byEntryId, pointTotals, (points) => ({ points })),
    mostAdrift: mostAdrift(byEntryId, results),
    narrowestEscape: narrowestEscape(byEntryId, results),
    busiest: highest(byEntryId, transferTotals, (transfers) => ({ transfers })),
  };
}

/** Sum of `pick(row)` across each member's settled-gameweek history rows. */
function seasonTotals(
  histories: Map<number, DraftEntryHistory>,
  settled: Set<number>,
  pick: (row: DraftEntryHistory['history'][number]) => number,
): Map<number, number> {
  const totals = new Map<number, number>();
  for (const [entryId, history] of histories) {
    const total = history.history
      .filter((row) => settled.has(row.event))
      .reduce((sum, row) => sum + pick(row), 0);
    totals.set(entryId, total);
  }
  return totals;
}

/** Whoever has the highest total, shaped by `toAward`. Null when there's no data. */
function highest<Award>(
  byEntryId: Map<number, DraftMember>,
  totals: Map<number, number>,
  toAward: (total: number) => Award,
): ({ member: DraftMember } & Award) | null {
  let bestEntryId: number | null = null;
  let bestTotal = -Infinity;

  for (const [entryId, total] of totals) {
    if (total > bestTotal) {
      bestTotal = total;
      bestEntryId = entryId;
    }
  }

  if (bestEntryId === null) return null;
  const member = byEntryId.get(bestEntryId);
  if (!member) return null;

  return { member, ...toAward(bestTotal) };
}

function bestWeek(
  byEntryId: Map<number, DraftMember>,
  results: Map<number, GridResult>,
): DraftAwards['bestWeek'] {
  let best: DraftAwards['bestWeek'] = null;

  for (const [gameweek, result] of results) {
    for (const [entryIdStr, points] of Object.entries(result.scores)) {
      const member = byEntryId.get(Number(entryIdStr));
      if (!member) continue;
      if (!best || points > best.points) {
        best = { member, gameweek, points };
      }
    }
  }

  return best;
}

function mostAdrift(
  byEntryId: Map<number, DraftMember>,
  results: Map<number, GridResult>,
): DraftAwards['mostAdrift'] {
  let widest: DraftAwards['mostAdrift'] = null;

  for (const [gameweek, result] of results) {
    const margin = bottomMargin(result);
    if (!margin) continue;
    const member = byEntryId.get(margin.bottomEntryId);
    if (!member) continue;
    if (!widest || margin.gap > widest.margin) {
      widest = { member, gameweek, margin: margin.gap };
    }
  }

  return widest;
}

function narrowestEscape(
  byEntryId: Map<number, DraftMember>,
  results: Map<number, GridResult>,
): DraftAwards['narrowestEscape'] {
  let narrowest: DraftAwards['narrowestEscape'] = null;

  for (const [gameweek, result] of results) {
    const margin = bottomMargin(result);
    if (!margin) continue;
    const bottom = byEntryId.get(margin.bottomEntryId);
    const escaped = byEntryId.get(margin.escapedEntryId);
    if (!bottom || !escaped) continue;
    if (!narrowest || margin.gap < narrowest.margin) {
      narrowest = { escaped, bottom, gameweek, margin: margin.gap };
    }
  }

  return narrowest;
}

/**
 * The gap between the lowest score and the next one up in a single
 * gameweek, and who's on each side of it. `null` when there's no such gap —
 * everyone tied, or fewer than two scores.
 */
function bottomMargin(
  result: GridResult,
): { bottomEntryId: number; escapedEntryId: number; gap: number } | null {
  const entries = Object.entries(result.scores).map(([id, points]) => ({
    entryId: Number(id),
    points,
  }));
  if (entries.length < 2) return null;

  const lowest = Math.min(...entries.map((e) => e.points));
  const bottom = entries.find((e) => e.points === lowest)!;
  const above = entries.filter((e) => e.points > lowest);
  if (above.length === 0) return null; // everyone tied

  const secondLowest = Math.min(...above.map((e) => e.points));
  const escaped = above.find((e) => e.points === secondLowest)!;

  return {
    bottomEntryId: bottom.entryId,
    escapedEntryId: escaped.entryId,
    gap: secondLowest - lowest,
  };
}
