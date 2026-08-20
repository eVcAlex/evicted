import { describe, expect, it } from 'vitest';
import type { Bootstrap, GameweekEvent } from '@/lib/fpl/schemas';
import { currentGameweek, nextGameweek, revalidateFor, settledGameweeks } from './gameweeks';

function event(id: number, overrides: Partial<GameweekEvent> = {}): GameweekEvent {
  return {
    id,
    name: `Gameweek ${id}`,
    deadline_time: '2026-08-21T17:30:00Z',
    finished: false,
    data_checked: false,
    is_current: false,
    is_next: false,
    is_previous: false,
    ...overrides,
  };
}

function bootstrap(events: GameweekEvent[]): Bootstrap {
  return { events };
}

describe('settledGameweeks', () => {
  it('requires both finished and data_checked', () => {
    const b = bootstrap([
      event(1, { finished: true, data_checked: true }),
      event(2, { finished: true, data_checked: false }),
      event(3, { finished: false, data_checked: false }),
    ]);
    expect(settledGameweeks(b)).toEqual([1]);
  });

  it('returns them in ascending order', () => {
    const b = bootstrap([
      event(3, { finished: true, data_checked: true }),
      event(1, { finished: true, data_checked: true }),
    ]);
    expect(settledGameweeks(b)).toEqual([1, 3]);
  });

  it('is empty before the season starts', () => {
    expect(settledGameweeks(bootstrap([event(1)]))).toEqual([]);
  });
});

describe('currentGameweek', () => {
  it('returns the event flagged is_current', () => {
    const b = bootstrap([event(1), event(2, { is_current: true })]);
    expect(currentGameweek(b)?.id).toBe(2);
  });

  it('returns null before the season starts', () => {
    expect(currentGameweek(bootstrap([event(1)]))).toBeNull();
  });
});

describe('nextGameweek', () => {
  it('returns the event flagged is_next', () => {
    const b = bootstrap([event(1, { is_next: true }), event(2)]);
    expect(nextGameweek(b)?.id).toBe(1);
  });
});

describe('revalidateFor', () => {
  it('refreshes every minute while a gameweek is live', () => {
    const b = bootstrap([event(1, { is_current: true, finished: false })]);
    expect(revalidateFor(b)).toBe(60);
  });

  it('backs off to an hour once the current gameweek is checked', () => {
    const b = bootstrap([
      event(1, { is_current: true, finished: true, data_checked: true }),
    ]);
    expect(revalidateFor(b)).toBe(3600);
  });

  it('keeps refreshing while a finished gameweek waits on bonus points', () => {
    const b = bootstrap([
      event(1, { is_current: true, finished: true, data_checked: false }),
    ]);
    expect(revalidateFor(b)).toBe(60);
  });

  it('backs off to an hour before the season starts', () => {
    expect(revalidateFor(bootstrap([event(1)]))).toBe(3600);
  });
});
