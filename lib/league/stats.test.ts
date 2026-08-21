import { describe, expect, it } from 'vitest';
import type { GameweekResult } from '@/lib/ledger/store';
import type { Member } from './members';
import { buildHallOfShame } from './stats';

const alex: Member = { entryId: 1, managerName: 'Alex', teamName: 'Høgh', joinedTime: null };
const ben: Member = { entryId: 2, managerName: 'Ben', teamName: 'Jacquet', joinedTime: null };
const charlie: Member = {
  entryId: 3,
  managerName: 'Charlie',
  teamName: 'Borussia',
  joinedTime: null,
};
const members = [alex, ben, charlie];

function result(scores: Record<number, number>, losers: number[]): GameweekResult {
  return { scores, losers, recordedAt: '2026-01-01T00:00:00Z' };
}

describe('buildHallOfShame', () => {
  it('returns nulls for an empty ledger', () => {
    const shame = buildHallOfShame({ members, results: new Map() });
    expect(shame.mostEvictions).toBeNull();
    expect(shame.worst).toBeNull();
    expect(shame.longestCleanRun).toBeNull();
  });

  describe('mostEvictions', () => {
    it('crowns whoever has been evicted the most', () => {
      const results = new Map([
        [1, result({ 1: 10, 2: 20, 3: 30 }, [1])],
        [2, result({ 1: 20, 2: 10, 3: 30 }, [2])],
        [3, result({ 1: 5, 2: 20, 3: 30 }, [1])],
      ]);

      const shame = buildHallOfShame({ members, results });
      expect(shame.mostEvictions).toEqual({ members: [alex], count: 2 });
    });

    it('lists everyone tied at the top', () => {
      const results = new Map([
        [1, result({ 1: 10, 2: 20 }, [1])],
        [2, result({ 1: 20, 2: 10 }, [2])],
      ]);

      const shame = buildHallOfShame({ members, results });
      expect(shame.mostEvictions?.count).toBe(1);
      expect(shame.mostEvictions?.members.sort((a, b) => a.entryId - b.entryId)).toEqual([
        alex,
        ben,
      ]);
    });

    it('drops a departed member rather than crashing', () => {
      const results = new Map([[1, result({ 99: 5, 1: 30 }, [99])]]);
      const shame = buildHallOfShame({ members, results });
      expect(shame.mostEvictions).toBeNull();
    });
  });

  describe('worst', () => {
    it('finds the lowest net score ever recorded', () => {
      const results = new Map([
        [1, result({ 1: 10, 2: 20 }, [1])],
        [2, result({ 1: 20, 2: -6 }, [2])],
      ]);

      const shame = buildHallOfShame({ members, results });
      expect(shame.worst).toEqual({ member: ben, gameweek: 2, net: -6 });
    });
  });

  describe('longestCleanRun', () => {
    it('counts consecutive recorded gameweeks without an eviction, most recent first', () => {
      const results = new Map([
        // Oldest first: Ben's own break has to sit further back than his run,
        // or "current" would mean nothing.
        [1, result({ 1: 30, 2: 5 }, [2])],
        [2, result({ 1: 10, 2: 40 }, [1])],
        [3, result({ 1: 5, 2: 40 }, [1])],
      ]);

      const shame = buildHallOfShame({ members, results });
      expect(shame.longestCleanRun).toEqual({ member: ben, weeks: 2 });
    });

    it('does not let a gameweek ben was absent from break the streak', () => {
      const results = new Map([
        // Ben not a scored member this gameweek — must be skipped, not
        // treated as a break, or the two clean weeks either side of it
        // would not count as one continuous run.
        [1, result({ 1: 40, 2: 30 }, [1])],
        [2, result({ 1: 40 }, [1])],
        [3, result({ 1: 20, 2: 40 }, [1])],
      ]);

      const shame = buildHallOfShame({ members, results });
      expect(shame.longestCleanRun).toEqual({ member: ben, weeks: 2 });
    });
  });
});
