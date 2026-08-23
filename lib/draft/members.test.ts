import { describe, expect, it } from 'vitest';
import { resolveDraftMembers } from './members';
import type { DraftLeagueDetails } from './schemas';

function details(entries: DraftLeagueDetails['league_entries']): DraftLeagueDetails {
  return {
    league: {
      id: 1,
      name: 'Test league',
      draft_status: 'post',
      draft_dt: null,
      closed: true,
      scoring: 'h',
      start_event: 1,
      stop_event: 38,
    },
    league_entries: entries,
    standings: [],
  };
}

describe('resolveDraftMembers', () => {
  it('keys entryId from id, not entry_id', () => {
    const members = resolveDraftMembers(
      details([
        {
          id: 17466,
          entry_id: 17456,
          entry_name: "Alex's Team",
          player_first_name: 'Alex',
          player_last_name: 'McGuiness',
          short_name: 'AM',
          joined_time: '2026-08-01T12:00:00Z',
        },
      ]),
    );

    expect(members).toEqual([
      {
        entryId: 17466,
        teamId: 17456,
        managerName: 'Alex McGuiness',
        teamName: "Alex's Team",
        shortName: 'AM',
        joinedTime: '2026-08-01T12:00:00Z',
      },
    ]);
  });

  it('carries a null entry_id through as a null teamId, for the synthetic AVERAGE entry', () => {
    const members = resolveDraftMembers(
      details([
        {
          id: 5,
          entry_id: null,
          entry_name: null,
          player_first_name: null,
          player_last_name: null,
          short_name: 'AV',
          joined_time: '2026-08-01T12:00:00Z',
        },
      ]),
    );

    expect(members[0]?.teamId).toBeNull();
  });

  it('falls back to placeholder text for the synthetic AVERAGE entry, whose name fields are null', () => {
    const members = resolveDraftMembers(
      details([
        {
          id: 5,
          entry_id: null,
          entry_name: null,
          player_first_name: null,
          player_last_name: null,
          short_name: 'AV',
          joined_time: '2026-08-01T12:00:00Z',
        },
      ]),
    );

    expect(members[0]?.managerName).toBe('Average');
    expect(members[0]?.teamName).toBe('Average');
  });

  it('returns an empty list for an empty league', () => {
    expect(resolveDraftMembers(details([]))).toEqual([]);
  });
});
