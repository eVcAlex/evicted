import { describe, expect, it } from 'vitest';
import { buildDraftAwards } from './awards';
import type { DraftMember } from './members';
import type { DraftEntryHistory } from './schemas';

function member(entryId: number, teamName: string): DraftMember {
  return {
    entryId,
    teamId: entryId * 100,
    managerName: teamName,
    teamName,
    shortName: teamName.slice(0, 2).toUpperCase(),
    joinedTime: '2026-08-01T12:00:00Z',
  };
}

function history(
  rows: Array<{ event: number; points: number; bench?: number; transfers?: number }>,
): DraftEntryHistory {
  return {
    history: rows.map((r) => ({
      event: r.event,
      points: r.points,
      total_points: r.points,
      points_on_bench: r.bench ?? 0,
      event_transfers: r.transfers ?? 0,
    })),
  };
}

describe('buildDraftAwards', () => {
  const members = [member(1, 'A'), member(2, 'B'), member(3, 'C')];

  it('finds the single highest-scoring gameweek', () => {
    const histories = new Map([
      [1, history([{ event: 1, points: 40 }, { event: 2, points: 70 }])],
      [2, history([{ event: 1, points: 30 }, { event: 2, points: 50 }])],
      [3, history([{ event: 1, points: 35 }, { event: 2, points: 45 }])],
    ]);
    const results = new Map([
      [1, { losers: [2], scores: { 1: 40, 2: 30, 3: 35 } }],
      [2, { losers: [3], scores: { 1: 70, 2: 50, 3: 45 } }],
    ]);

    const awards = buildDraftAwards({ members, histories, results });
    expect(awards.bestWeek).toEqual({ member: member(1, 'A'), gameweek: 2, points: 70 });
  });

  it('sums bench points and transfers across settled gameweeks only', () => {
    const histories = new Map([
      [1, history([{ event: 1, points: 40, bench: 5, transfers: 1 }, { event: 2, points: 20, bench: 30, transfers: 5 }])],
      [2, history([{ event: 1, points: 30, bench: 2, transfers: 0 }, { event: 2, points: 50, bench: 1, transfers: 0 }])],
      [3, history([{ event: 1, points: 35, bench: 1, transfers: 0 }, { event: 2, points: 45, bench: 0, transfers: 0 }])],
    ]);
    // Only gameweek 1 is settled — member 1's huge bench/transfer week 2 should not count.
    const results = new Map([[1, { losers: [2], scores: { 1: 40, 2: 30, 3: 35 } }]]);

    const awards = buildDraftAwards({ members, histories, results });
    expect(awards.benchWaste).toEqual({ member: member(1, 'A'), points: 5 });
    expect(awards.busiest).toEqual({ member: member(1, 'A'), transfers: 1 });
  });

  it('finds the biggest and smallest gaps between the bottom and the next score up, across gameweeks', () => {
    const histories = new Map([
      [1, history([{ event: 1, points: 10 }, { event: 2, points: 5 }])],
      [2, history([{ event: 1, points: 12 }, { event: 2, points: 35 }])],
      [3, history([{ event: 1, points: 50 }, { event: 2, points: 40 }])],
    ]);
    // GW1: bottom is 1 (10), next up is 2 (12) — a narrow 2-point gap.
    // GW2: bottom is 1 (5), next up is 2 (35) — a wide 30-point gap.
    const results = new Map([
      [1, { losers: [1], scores: { 1: 10, 2: 12, 3: 50 } }],
      [2, { losers: [1], scores: { 1: 5, 2: 35, 3: 40 } }],
    ]);

    const awards = buildDraftAwards({ members, histories, results });
    expect(awards.mostAdrift).toEqual({ member: member(1, 'A'), gameweek: 2, margin: 30 });
    expect(awards.narrowestEscape).toEqual({
      escaped: member(2, 'B'),
      bottom: member(1, 'A'),
      gameweek: 1,
      margin: 2,
    });
  });

  it('returns nulls for every award when there are no settled gameweeks', () => {
    const awards = buildDraftAwards({ members, histories: new Map(), results: new Map() });
    expect(awards).toEqual({
      bestWeek: null,
      benchWaste: null,
      mostPoints: null,
      mostAdrift: null,
      narrowestEscape: null,
      busiest: null,
    });
  });

  it('has no adrift/escape award for a gameweek where everyone is tied', () => {
    const histories = new Map([
      [1, history([{ event: 1, points: 20 }])],
      [2, history([{ event: 1, points: 20 }])],
    ]);
    const results = new Map([[1, { losers: [1, 2], scores: { 1: 20, 2: 20 } }]]);

    const awards = buildDraftAwards({ members: [member(1, 'A'), member(2, 'B')], histories, results });
    expect(awards.mostAdrift).toBeNull();
    expect(awards.narrowestEscape).toBeNull();
  });
});
