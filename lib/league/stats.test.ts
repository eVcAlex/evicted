import { describe, expect, it } from 'vitest';
import type { EntryHistory } from '@/lib/fpl/schemas';
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

/** An EntryHistory carrying only the bench field each row is tested on. */
function history(
  rows: Array<{ event: number; bench: number }>,
  chips: Array<{ name: string; event: number }> = [],
): EntryHistory {
  return {
    current: rows.map((r) => ({
      event: r.event,
      points: 0,
      event_transfers_cost: 0,
      total_points: 0,
      points_on_bench: r.bench,
    })),
    chips,
  };
}

describe('buildHallOfShame', () => {
  it('returns nulls for an empty ledger', () => {
    const shame = buildHallOfShame({ members, results: new Map() });
    expect(shame.mostEvictions).toBeNull();
    expect(shame.worst).toBeNull();
    expect(shame.longestCleanRun).toBeNull();
    expect(shame.longestLosingStreak).toBeNull();
    expect(shame.worstBenchHaul).toBeNull();
    expect(shame.biggestBottler).toBeNull();
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

  describe('worstBenchHaul', () => {
    it('is null when no histories are supplied', () => {
      const results = new Map([
        [1, result({ 1: 10, 2: 20 }, [1])],
        [2, result({ 1: 20, 2: 10 }, [2])],
      ]);

      const shame = buildHallOfShame({ members, results });
      expect(shame.worstBenchHaul).toBeNull();
    });

    it('crowns the single gameweek with the most points left on the bench', () => {
      const results = new Map([
        [1, result({ 1: 10, 2: 20 }, [1])],
        [2, result({ 1: 20, 2: 10 }, [2])],
      ]);
      const histories = new Map([
        [1, history([{ event: 1, bench: 20 }, { event: 2, bench: 3 }])],
        [2, history([{ event: 1, bench: 8 }, { event: 2, bench: 34 }])],
      ]);

      const shame = buildHallOfShame({ members, results, histories });
      expect(shame.worstBenchHaul).toEqual({ member: ben, gameweek: 2, bench: 34 });
    });

    it('ignores gameweeks that are not settled in the ledger', () => {
      const results = new Map([[1, result({ 1: 10, 2: 20 }, [1])]]);
      const histories = new Map([
        // GW2's fat bench never counts: it is not a settled result.
        [1, history([{ event: 1, bench: 5 }, { event: 2, bench: 99 }])],
        [2, history([{ event: 1, bench: 12 }])],
      ]);

      const shame = buildHallOfShame({ members, results, histories });
      expect(shame.worstBenchHaul).toEqual({ member: ben, gameweek: 1, bench: 12 });
    });

    it('only counts a manager in a gameweek they were a scored member of', () => {
      const results = new Map([
        // Ben absent from GW1's scores, so his GW1 bench must not count.
        [1, result({ 1: 10 }, [1])],
        [2, result({ 1: 20, 2: 10 }, [2])],
      ]);
      const histories = new Map([
        [1, history([{ event: 1, bench: 4 }, { event: 2, bench: 6 }])],
        [2, history([{ event: 1, bench: 50 }, { event: 2, bench: 7 }])],
      ]);

      // Ben's GW1 bench of 50 is the biggest number in the data but must not
      // win: he was not a scored member that week. The max among the rows that
      // do count is his GW2 bench of 7.
      const shame = buildHallOfShame({ members, results, histories });
      expect(shame.worstBenchHaul).toEqual({ member: ben, gameweek: 2, bench: 7 });
    });

    it('excludes a gameweek played with Bench Boost, even if its bench is the fattest', () => {
      const results = new Map([
        [1, result({ 1: 10, 2: 20 }, [1])],
        [2, result({ 1: 20, 2: 10 }, [2])],
      ]);
      const histories = new Map([
        // Alex's GW1 bench of 40 would win outright, but it was Bench Boosted:
        // those points scored, so GW1 must be skipped in favour of his GW2.
        [1, history([{ event: 1, bench: 40 }, { event: 2, bench: 5 }], [{ name: 'bboost', event: 1 }])],
        [2, history([{ event: 1, bench: 2 }, { event: 2, bench: 1 }])],
      ]);

      const shame = buildHallOfShame({ members, results, histories });
      expect(shame.worstBenchHaul).toEqual({ member: alex, gameweek: 2, bench: 5 });
    });

    it('is null when every settled gameweek with bench data was Bench Boosted', () => {
      const results = new Map([[1, result({ 1: 10 }, [1])]]);
      const histories = new Map([
        [1, history([{ event: 1, bench: 40 }], [{ name: 'bboost', event: 1 }])],
      ]);

      const shame = buildHallOfShame({ members, results, histories });
      expect(shame.worstBenchHaul).toBeNull();
    });
  });

  describe('biggestBottler', () => {
    it('finds the sharpest fall between two played gameweeks', () => {
      const results = new Map([
        [1, result({ 1: 60, 2: 40 }, [2])],
        [2, result({ 1: 12, 2: 45 }, [1])],
        [3, result({ 1: 30, 2: 20 }, [2])],
      ]);

      // Alex: 60 to 12 is a 48 drop, the biggest anywhere. Ben only ever rises
      // then falls 25, so Alex is the bottler.
      const shame = buildHallOfShame({ members, results });
      expect(shame.biggestBottler).toEqual({
        member: alex,
        fromGameweek: 1,
        toGameweek: 2,
        drop: 48,
      });
    });

    it('measures against the next gameweek a manager actually played', () => {
      const results = new Map([
        [1, result({ 1: 50 }, [1])],
        // Alex sits out GW2, so his drop is GW1 to GW3, not through the gap.
        [2, result({ 2: 30 }, [2])],
        [3, result({ 1: 20 }, [1])],
      ]);

      const shame = buildHallOfShame({ members, results });
      expect(shame.biggestBottler).toEqual({
        member: alex,
        fromGameweek: 1,
        toGameweek: 3,
        drop: 30,
      });
    });

    it('is null when nobody ever dropped', () => {
      const results = new Map([
        [1, result({ 1: 10, 2: 20 }, [1])],
        [2, result({ 1: 30, 2: 40 }, [1])],
      ]);

      const shame = buildHallOfShame({ members, results });
      expect(shame.biggestBottler).toBeNull();
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

    it('hides the row rather than pick a name when the lead is tied', () => {
      // Nobody has ever been bottom, so everyone is level on the same streak.
      // Naming any one of them would claim a lead nobody actually holds.
      const results = new Map([[1, result({ 1: 10, 2: 20, 3: 30 }, [])]]);

      const shame = buildHallOfShame({ members, results });
      expect(shame.longestCleanRun).toBeNull();
    });
  });

  describe('longestLosingStreak', () => {
    it('finds the longest run of consecutive evictions anywhere in the season', () => {
      const results = new Map([
        [1, result({ 1: 5, 2: 40 }, [1])],
        [2, result({ 1: 5, 2: 40 }, [1])],
        [3, result({ 1: 30, 2: 10 }, [2])],
        [4, result({ 1: 5, 2: 40 }, [1])],
      ]);

      const shame = buildHallOfShame({ members, results });
      expect(shame.longestLosingStreak).toEqual({
        member: alex,
        weeks: 2,
        fromGameweek: 1,
        toGameweek: 2,
      });
    });

    it('is not limited to a streak still active today', () => {
      const results = new Map([
        [1, result({ 1: 30, 2: 10 }, [2])],
        [2, result({ 1: 30, 2: 10 }, [2])],
        [3, result({ 1: 30, 2: 10 }, [2])],
        [4, result({ 1: 5, 2: 40 }, [1])],
      ]);

      // Ben's three-week run in the past beats Alex's single current week.
      const shame = buildHallOfShame({ members, results });
      expect(shame.longestLosingStreak).toEqual({
        member: ben,
        weeks: 3,
        fromGameweek: 1,
        toGameweek: 3,
      });
    });

    it('does not let a gameweek a manager was absent from break the streak', () => {
      const results = new Map([
        [1, result({ 1: 40, 2: 10 }, [2])],
        // Ben not a scored member this gameweek — must be skipped, not
        // treated as a break.
        [2, result({ 1: 40 }, [])],
        [3, result({ 1: 40, 2: 10 }, [2])],
      ]);

      const shame = buildHallOfShame({ members, results });
      expect(shame.longestLosingStreak).toEqual({
        member: ben,
        weeks: 2,
        fromGameweek: 1,
        toGameweek: 3,
      });
    });

    it('is null when nobody has ever been evicted', () => {
      const results = new Map([[1, result({ 1: 10, 2: 20 }, [])]]);
      const shame = buildHallOfShame({ members, results });
      expect(shame.longestLosingStreak).toBeNull();
    });
  });
});
