import { describe, expect, it } from 'vitest';
import type { EntryHistory } from '@/lib/fpl/schemas';
import { findLosers, scoresForGameweek } from './scoring';

function history(
  entries: Array<{ event: number; points: number; hits?: number }>,
): EntryHistory {
  return {
    current: entries.map((e) => ({
      event: e.event,
      points: e.points,
      event_transfers_cost: e.hits ?? 0,
      total_points: e.points,
      points_on_bench: 0,
    })),
  };
}

describe('scoresForGameweek', () => {
  it('subtracts transfer hits from gross points', () => {
    const histories = new Map([[1, history([{ event: 5, points: 34, hits: 4 }])]]);
    expect(scoresForGameweek(histories, 5)).toEqual([
      { entryId: 1, gross: 34, hits: 4, net: 30 },
    ]);
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
      { entryId: 1, gross: 50, hits: 0, net: 50 },
      { entryId: 2, gross: 34, hits: 4, net: 30 },
      { entryId: 3, gross: 45, hits: 0, net: 45 },
    ]);
    expect(losers).toEqual([2]);
  });

  it('returns every manager tied at the bottom', () => {
    const losers = findLosers([
      { entryId: 1, gross: 30, hits: 0, net: 30 },
      { entryId: 2, gross: 34, hits: 4, net: 30 },
      { entryId: 3, gross: 45, hits: 0, net: 45 },
    ]);
    expect(losers.sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('picks the manager whose hits dragged them below a lower gross scorer', () => {
    const losers = findLosers([
      { entryId: 1, gross: 40, hits: 12, net: 28 },
      { entryId: 2, gross: 32, hits: 0, net: 32 },
    ]);
    expect(losers).toEqual([1]);
  });

  it('handles negative net scores', () => {
    const losers = findLosers([
      { entryId: 1, gross: 2, hits: 8, net: -6 },
      { entryId: 2, gross: 10, hits: 0, net: 10 },
    ]);
    expect(losers).toEqual([1]);
  });

  it('returns an empty list when there are no scores', () => {
    expect(findLosers([])).toEqual([]);
  });
});
