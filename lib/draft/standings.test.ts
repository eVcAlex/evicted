import { describe, expect, it } from 'vitest';
import type { DraftMember } from './members';
import type { DraftStanding } from './schemas';
import { buildStandingsRows } from './standings';

function member(entryId: number, teamName: string, teamId: number | null = entryId * 100): DraftMember {
  return {
    entryId,
    teamId,
    managerName: teamName,
    teamName,
    shortName: teamName.slice(0, 2).toUpperCase(),
    joinedTime: '2026-08-01T12:00:00Z',
  };
}

function standing(entryId: number, overrides: Partial<DraftStanding> = {}): DraftStanding {
  return {
    league_entry: entryId,
    rank: null,
    matches_won: 0,
    matches_drawn: 0,
    matches_lost: 0,
    points_for: 0,
    points_against: 0,
    total: 0,
    ...overrides,
  };
}

describe('buildStandingsRows', () => {
  it('joins a member to their standings row by entryId, not teamId', () => {
    const rows = buildStandingsRows(
      [member(1, 'A')],
      [standing(1, { rank: 1, matches_won: 3, total: 9 })],
    );

    expect(rows).toEqual([
      expect.objectContaining({ member: member(1, 'A'), rank: 1, won: 3, total: 9 }),
    ]);
  });

  it('sorts real teams by rank', () => {
    const rows = buildStandingsRows(
      [member(1, 'A'), member(2, 'B')],
      [standing(1, { rank: 2 }), standing(2, { rank: 1 })],
    );

    expect(rows.map((r) => r.member.teamName)).toEqual(['B', 'A']);
  });

  it('preserves join order when every rank is still null, mid-preseason', () => {
    const rows = buildStandingsRows(
      [member(1, 'A'), member(2, 'B'), member(3, 'C')],
      [standing(1), standing(2), standing(3)],
    );

    expect(rows.map((r) => r.member.teamName)).toEqual(['A', 'B', 'C']);
  });

  it('sorts the synthetic AVERAGE entry (null teamId) into its rank like anyone else', () => {
    const rows = buildStandingsRows(
      [member(1, 'A'), member(2, 'Average', null), member(3, 'C')],
      [standing(1, { rank: 1 }), standing(2, { rank: 2 }), standing(3, { rank: 3 })],
    );

    expect(rows.map((r) => r.member.teamName)).toEqual(['A', 'Average', 'C']);
  });

  it('drops a member with no matching standings row', () => {
    const rows = buildStandingsRows([member(1, 'A'), member(2, 'B')], [standing(1)]);

    expect(rows.map((r) => r.member.teamName)).toEqual(['A']);
  });
});
