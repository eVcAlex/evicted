import { describe, expect, it, vi } from 'vitest';
import { buildSeasonResults } from './season';
import type { DraftMember } from './members';

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

describe('buildSeasonResults', () => {
  it('builds a GridResult per settled gameweek', () => {
    const members = [member(1, 'A'), member(2, 'B')];
    const histories = new Map([
      [1, { history: [{ event: 1, points: 50, total_points: 50, points_on_bench: 0, event_transfers: 0 }] }],
      [2, { history: [{ event: 1, points: 30, total_points: 30, points_on_bench: 0, event_transfers: 0 }] }],
    ]);

    const results = buildSeasonResults({ histories, gameweeks: [1], members });

    expect(results.get(1)).toEqual({ losers: [2], scores: { 1: 50, 2: 30 } });
  });

  it('skips a gameweek entirely when a member is missing a score', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const members = [member(1, 'A'), member(2, 'B')];
    const histories = new Map([
      [1, { history: [{ event: 1, points: 50, total_points: 50, points_on_bench: 0, event_transfers: 0 }] }],
      [2, { history: [] }],
    ]);

    const results = buildSeasonResults({ histories, gameweeks: [1], members });

    expect(results.has(1)).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('ignores an unclaimed slot (null teamId) when checking completeness', () => {
    const members = [member(1, 'A'), { ...member(2, 'B'), teamId: null }];
    const histories = new Map([
      [1, { history: [{ event: 1, points: 50, total_points: 50, points_on_bench: 0, event_transfers: 0 }] }],
    ]);

    const results = buildSeasonResults({ histories, gameweeks: [1], members });

    expect(results.get(1)).toEqual({ losers: [1], scores: { 1: 50 } });
  });
});
