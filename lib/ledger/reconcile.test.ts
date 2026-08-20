import { describe, expect, it } from 'vitest';
import { gameweeksNeedingRecord } from './reconcile';

describe('gameweeksNeedingRecord', () => {
  it('returns settled gameweeks that have no record', () => {
    expect(gameweeksNeedingRecord([1, 2, 3], [1])).toEqual([2, 3]);
  });

  it('returns nothing when everything is recorded', () => {
    expect(gameweeksNeedingRecord([1, 2], [1, 2])).toEqual([]);
  });

  it('returns nothing before any gameweek settles', () => {
    expect(gameweeksNeedingRecord([], [])).toEqual([]);
  });

  it('fills a multi-week gap oldest first', () => {
    expect(gameweeksNeedingRecord([1, 2, 3, 4, 5], [1, 2])).toEqual([3, 4, 5]);
  });

  it('ignores recorded gameweeks that are not settled', () => {
    expect(gameweeksNeedingRecord([1], [1, 2, 3])).toEqual([]);
  });

  it('sorts ascending even when settled arrives unsorted', () => {
    expect(gameweeksNeedingRecord([5, 3, 4], [])).toEqual([3, 4, 5]);
  });
});
