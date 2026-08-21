import { describe, expect, it } from 'vitest';
import type { EntryHistory } from '@/lib/fpl/schemas';
import { findLosers, scoresForGameweek, type GameweekScore } from './scoring';

/** `findLosers` only reads `net`; the rest is filler to satisfy the type. */
function score(entryId: number, gross: number, hits: number, net: number): GameweekScore {
  return { entryId, gross, hits, net, bench: 0 };
}

function history(
  entries: Array<{ event: number; points: number; hits?: number; bench?: number }>,
): EntryHistory {
  return {
    current: entries.map((e) => ({
      event: e.event,
      points: e.points,
      event_transfers_cost: e.hits ?? 0,
      total_points: e.points,
      points_on_bench: e.bench ?? 0,
    })),
  };
}

describe('scoresForGameweek', () => {
  it('subtracts transfer hits from gross points', () => {
    const histories = new Map([[1, history([{ event: 5, points: 34, hits: 4 }])]]);
    expect(scoresForGameweek(histories, 5)).toEqual([
      { entryId: 1, gross: 34, hits: 4, net: 30, bench: 0 },
    ]);
  });

  it('carries bench points through untouched', () => {
    const histories = new Map([[1, history([{ event: 5, points: 34, bench: 11 }])]]);
    expect(scoresForGameweek(histories, 5)[0].bench).toBe(11);
  });

  it('leaves a score untouched when no hits were taken', () => {
    const histories = new Map([[1, history([{ event: 5, points: 62 }])]]);
    expect(scoresForGameweek(histories, 5)[0].net).toBe(62);
  });

  it('skips managers with no entry for that gameweek', () => {
    const histories = new Map([
      [1, history([{ event: 5, points: 40 }])],
      [2, history([{ event: 6, points: 40 }])],
    ]);
    expect(scoresForGameweek(histories, 5).map((s) => s.entryId)).toEqual([1]);
  });

  it('returns an empty list when nobody has played the gameweek', () => {
    const histories = new Map([[1, history([])]]);
    expect(scoresForGameweek(histories, 5)).toEqual([]);
  });
});

describe('findLosers', () => {
  it('returns the single lowest net scorer', () => {
    const losers = findLosers([
      score(1, 50, 0, 50),
      score(2, 34, 4, 30),
      score(3, 45, 0, 45),
    ]);
    expect(losers).toEqual([2]);
  });

  it('returns every manager tied at the bottom', () => {
    const losers = findLosers([
      score(1, 30, 0, 30),
      score(2, 34, 4, 30),
      score(3, 45, 0, 45),
    ]);
    expect(losers.sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('picks the manager whose hits dragged them below a lower gross scorer', () => {
    const losers = findLosers([score(1, 40, 12, 28), score(2, 32, 0, 32)]);
    expect(losers).toEqual([1]);
  });

  it('handles negative net scores', () => {
    const losers = findLosers([score(1, 2, 8, -6), score(2, 10, 0, 10)]);
    expect(losers).toEqual([1]);
  });

  it('returns an empty list when there are no scores', () => {
    expect(findLosers([])).toEqual([]);
  });
});

describe('scoresForGameweek eligibility', () => {
  it('excludes a manager from gameweeks before they joined the league', () => {
    const histories = new Map([
      [1, history([{ event: 1, points: 20 }, { event: 10, points: 40 }])],
    ]);
    const eligibleFrom = new Map([[1, 10]]);

    expect(scoresForGameweek(histories, 1, eligibleFrom)).toEqual([]);
    expect(scoresForGameweek(histories, 10, eligibleFrom).map((s) => s.entryId)).toEqual([
      1,
    ]);
  });

  it('leaves a founding member scored for every gameweek', () => {
    const histories = new Map([[1, history([{ event: 1, points: 20 }])]]);
    expect(scoresForGameweek(histories, 1, new Map([[1, 1]]))).toHaveLength(1);
  });
});
