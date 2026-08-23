import { describe, expect, it } from 'vitest';
import { findBottom, pointsForGameweek } from './scoring';
import type { DraftEntryHistory } from './schemas';

function history(
  entries: Array<{ event: number; points: number; bench?: number; transfers?: number }>,
): DraftEntryHistory {
  return {
    history: entries.map((e) => ({
      event: e.event,
      points: e.points,
      total_points: e.points,
      points_on_bench: e.bench ?? 0,
      event_transfers: e.transfers ?? 0,
    })),
  };
}

describe('pointsForGameweek', () => {
  it('reads points straight through, with no hits deduction', () => {
    const histories = new Map([[1, history([{ event: 5, points: 34 }])]]);
    expect(pointsForGameweek(histories, 5)).toEqual([
      { entryId: 1, points: 34, bench: 0, transfers: 0 },
    ]);
  });

  it('carries bench points and transfer count through', () => {
    const histories = new Map([[1, history([{ event: 5, points: 34, bench: 11, transfers: 2 }])]]);
    const [score] = pointsForGameweek(histories, 5);
    expect(score.bench).toBe(11);
    expect(score.transfers).toBe(2);
  });

  it('skips managers with no history row for that gameweek', () => {
    const histories = new Map([
      [1, history([{ event: 5, points: 40 }])],
      [2, history([{ event: 6, points: 40 }])],
    ]);
    expect(pointsForGameweek(histories, 5).map((s) => s.entryId)).toEqual([1]);
  });

  it('returns an empty list when nobody has played the gameweek', () => {
    expect(pointsForGameweek(new Map([[1, history([])]]), 5)).toEqual([]);
  });
});

describe('findBottom', () => {
  it('returns the single lowest scorer', () => {
    expect(
      findBottom([
        { entryId: 1, points: 50, bench: 0, transfers: 0 },
        { entryId: 2, points: 30, bench: 0, transfers: 0 },
        { entryId: 3, points: 45, bench: 0, transfers: 0 },
      ]),
    ).toEqual([2]);
  });

  it('returns every manager tied at the bottom', () => {
    expect(
      findBottom([
        { entryId: 1, points: 30, bench: 0, transfers: 0 },
        { entryId: 2, points: 30, bench: 0, transfers: 0 },
        { entryId: 3, points: 45, bench: 0, transfers: 0 },
      ]),
    ).toEqual(expect.arrayContaining([1, 2]));
  });

  it('returns an empty list when there are no scores', () => {
    expect(findBottom([])).toEqual([]);
  });
});
