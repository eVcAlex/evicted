import { describe, expect, it } from 'vitest';
import { currentGameweek, isSettled, nextGameweek, revalidateForGame, settledGameweeks } from './gameweeks';
import type { DraftBootstrap, DraftEvent, DraftLeagueMeta } from './schemas';

function event(id: number, overrides: Partial<DraftEvent> = {}): DraftEvent {
  return {
    id,
    name: `Gameweek ${id}`,
    deadline_time: '2026-08-21T17:30:00Z',
    finished: false,
    average_entry_score: null,
    highest_scoring_entry: null,
    ...overrides,
  };
}

function bootstrap(data: DraftEvent[], current: number | null = null, next: number | null = null): DraftBootstrap {
  return { events: { current, next, data } };
}

function league(overrides: Partial<DraftLeagueMeta> = {}): DraftLeagueMeta {
  return {
    id: 1,
    name: 'Test league',
    draft_status: 'post',
    draft_dt: null,
    closed: true,
    scoring: 'h',
    start_event: 1,
    stop_event: 38,
    ...overrides,
  };
}

describe('isSettled', () => {
  it('requires both finished and a non-null average_entry_score', () => {
    expect(isSettled(event(1, { finished: true, average_entry_score: 45 }))).toBe(true);
    expect(isSettled(event(1, { finished: true, average_entry_score: null }))).toBe(false);
    expect(isSettled(event(1, { finished: false, average_entry_score: 45 }))).toBe(false);
  });
});

describe('settledGameweeks', () => {
  it('returns only settled gameweeks, ascending', () => {
    const b = bootstrap([
      event(3, { finished: true, average_entry_score: 40 }),
      event(1, { finished: true, average_entry_score: 38 }),
      event(2, { finished: true, average_entry_score: null }),
    ]);
    expect(settledGameweeks(b, league())).toEqual([1, 3]);
  });

  it('bounds the range to the league start/stop event', () => {
    const b = bootstrap([
      event(1, { finished: true, average_entry_score: 30 }),
      event(2, { finished: true, average_entry_score: 40 }),
    ]);
    expect(settledGameweeks(b, league({ start_event: 2, stop_event: 38 }))).toEqual([2]);
  });
});

describe('currentGameweek / nextGameweek', () => {
  it('resolves the ids from events.current / events.next', () => {
    const b = bootstrap([event(1), event(2)], 2, null);
    expect(currentGameweek(b)?.id).toBe(2);
  });

  it('returns null once both go null (season over)', () => {
    const b = bootstrap([event(1)], null, null);
    expect(currentGameweek(b)).toBeNull();
    expect(nextGameweek(b)).toBeNull();
  });
});

describe('revalidateForGame', () => {
  it('refreshes every minute while the current gameweek is live', () => {
    expect(revalidateForGame({ current_event: 1, current_event_finished: false, next_event: 2 })).toBe(60);
  });

  it('backs off to an hour once the current gameweek finishes', () => {
    expect(revalidateForGame({ current_event: 1, current_event_finished: true, next_event: 2 })).toBe(3600);
  });
});
