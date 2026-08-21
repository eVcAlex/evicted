import { describe, expect, it } from 'vitest';
import type { GameweekResult } from '@/lib/ledger/store';
import { lossesByEntry } from './history';

function result(losers: number[]): GameweekResult {
  return { losers, scores: {}, recordedAt: '2026-01-01T00:00:00Z' };
}

describe('lossesByEntry', () => {
  it('collects each entry\'s losses in gameweek order', () => {
    const results = new Map([
      [3, result([1])],
      [1, result([2])],
      [2, result([1, 2])],
    ]);

    const byEntry = lossesByEntry(results);

    expect(byEntry.get(1)).toEqual([2, 3]);
    expect(byEntry.get(2)).toEqual([1, 2]);
  });

  it('omits entries that have never lost', () => {
    const results = new Map([[1, result([2])]]);
    expect(lossesByEntry(results).has(1)).toBe(false);
  });

  it('returns an empty map for no results', () => {
    expect(lossesByEntry(new Map()).size).toBe(0);
  });
});
