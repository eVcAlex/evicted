import { describe, expect, it } from 'vitest';
import {
  draftBootstrapSchema,
  draftEntryHistorySchema,
  draftGameSchema,
  draftLeagueDetailsSchema,
} from './schemas';

// Representative payloads shaped from live curls against public draft
// leagues (ids 1, 100, 4321) during planning — not yet replaced with real
// fixtures captured from this app's own league (id 77196).

describe('draftBootstrapSchema', () => {
  it('parses the events wrapper, including an unplayed event', () => {
    const parsed = draftBootstrapSchema.parse({
      events: {
        current: 1,
        next: 2,
        data: [
          {
            id: 1,
            name: 'Gameweek 1',
            deadline_time: '2026-08-21T17:30:00Z',
            finished: false,
            average_entry_score: null,
            highest_scoring_entry: null,
          },
        ],
      },
    });
    expect(parsed.events.current).toBe(1);
    expect(parsed.events.data[0]?.average_entry_score).toBeNull();
  });

  it('allows both current and next to be null (season over)', () => {
    expect(() =>
      draftBootstrapSchema.parse({ events: { current: null, next: null, data: [] } }),
    ).not.toThrow();
  });
});

describe('draftGameSchema', () => {
  it('parses the cheap poll shape', () => {
    const parsed = draftGameSchema.parse({
      current_event: 1,
      current_event_finished: false,
      next_event: 2,
    });
    expect(parsed.current_event_finished).toBe(false);
  });
});

describe('draftLeagueDetailsSchema', () => {
  it('parses league_entries with a null entry_id (unclaimed slot)', () => {
    const parsed = draftLeagueDetailsSchema.parse({
      league: {
        id: 4321,
        name: 'Test Draft League',
        draft_status: 'post',
        draft_dt: '2026-08-10T18:00:00Z',
        closed: true,
        scoring: 'h',
        start_event: 2,
        stop_event: 38,
      },
      league_entries: [
        {
          id: 17466,
          entry_id: 17456,
          entry_name: "Alex's Team",
          player_first_name: 'Alex',
          player_last_name: 'McGuiness',
          short_name: 'AM',
          joined_time: '2026-08-01T12:00:00Z',
        },
        {
          id: 17467,
          entry_id: null,
          entry_name: null,
          player_first_name: null,
          player_last_name: null,
          short_name: 'AV',
          joined_time: '2026-08-01T12:00:00Z',
        },
      ],
      standings: [
        {
          league_entry: 17466,
          rank: null,
          matches_won: 0,
          matches_drawn: 0,
          matches_lost: 0,
          points_for: 0,
          points_against: 0,
          total: 0,
        },
      ],
    });
    expect(parsed.league.start_event).toBe(2);
    expect(parsed.league_entries[1]?.entry_id).toBeNull();
    expect(parsed.standings[0]?.rank).toBeNull();
  });

  it('parses the league.drafts array, keeping draft_completed', () => {
    const parsed = draftLeagueDetailsSchema.parse({
      league: {
        id: 77196,
        name: 'Evicted',
        draft_status: 'pre',
        draft_dt: '2026-08-21T11:00:00Z',
        closed: true,
        scoring: 'h',
        start_event: 1,
        stop_event: 38,
        drafts: [
          { draft_started: true, draft_completed: '2026-08-21T11:23:22.672585Z', event: 1 },
        ],
      },
      league_entries: [],
      standings: [],
    });

    expect(parsed.league.drafts[0]?.draft_completed).toBe('2026-08-21T11:23:22.672585Z');
  });

  it('defaults league.drafts to [] when the API omits it', () => {
    const parsed = draftLeagueDetailsSchema.parse({
      league: {
        id: 4321,
        name: 'Test Draft League',
        draft_status: 'pre',
        draft_dt: null,
        closed: false,
        scoring: 'h',
        start_event: 1,
        stop_event: 38,
      },
      league_entries: [],
      standings: [],
    });

    expect(parsed.league.drafts).toEqual([]);
  });
});

describe('draftEntryHistorySchema', () => {
  it('parses a history row with no event_transfers_cost field', () => {
    const parsed = draftEntryHistorySchema.parse({
      history: [
        { event: 1, points: 45, total_points: 45, points_on_bench: 6, event_transfers: 1 },
      ],
    });
    expect(parsed.history[0]?.points).toBe(45);
  });
});
