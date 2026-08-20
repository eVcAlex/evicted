import { describe, expect, it } from 'vitest';
import type { Bootstrap, GameweekEvent } from '@/lib/fpl/schemas';
import type { Member } from './members';
import { eligibleFromByEntry, isEligible, joinGameweek } from './eligibility';

function event(id: number, deadline: string): GameweekEvent {
  return {
    id,
    name: `Gameweek ${id}`,
    deadline_time: deadline,
    finished: false,
    data_checked: false,
    is_current: false,
    is_next: false,
    is_previous: false,
  };
}

/** GW1 21 Aug, then one a week. */
const bootstrap: Bootstrap = {
  events: [
    event(1, '2026-08-21T17:30:00Z'),
    event(2, '2026-08-28T17:30:00Z'),
    event(3, '2026-09-04T17:30:00Z'),
  ],
};

function member(entryId: number, joinedTime: string | null): Member {
  return { entryId, managerName: 'A Manager', teamName: 'A Team', joinedTime };
}

describe('joinGameweek', () => {
  it('makes a pre-season joiner eligible from the first gameweek', () => {
    expect(joinGameweek(bootstrap, '2026-07-23T16:37:00Z', 1)).toBe(1);
  });

  it('makes a mid-season joiner eligible from the next unlocked gameweek', () => {
    expect(joinGameweek(bootstrap, '2026-08-30T12:00:00Z', 1)).toBe(3);
  });

  it('does not credit a joiner with a gameweek whose deadline has passed', () => {
    // Joined an hour after GW2 locked: GW2 was never theirs to lose.
    expect(joinGameweek(bootstrap, '2026-08-28T18:30:00Z', 1)).toBe(3);
  });

  it('treats an unknown join time as the league start event', () => {
    expect(joinGameweek(bootstrap, null, 2)).toBe(2);
  });

  it('treats an unparseable join time as the league start event', () => {
    expect(joinGameweek(bootstrap, 'not a date', 1)).toBe(1);
  });

  it('never predates the league start event', () => {
    expect(joinGameweek(bootstrap, '2026-07-23T16:37:00Z', 2)).toBe(2);
  });

  it('leaves someone who joined after the last deadline liable for nothing', () => {
    const from = joinGameweek(bootstrap, '2027-06-01T00:00:00Z', 1);
    expect(isEligible(new Map([[1, from]]), 1, 3)).toBe(false);
  });
});

describe('eligibleFromByEntry', () => {
  it('maps every member to their first eligible gameweek', () => {
    const map = eligibleFromByEntry({
      bootstrap,
      members: [member(1, '2026-07-23T16:37:00Z'), member(2, '2026-08-30T12:00:00Z')],
      startEvent: 1,
    });

    expect(map.get(1)).toBe(1);
    expect(map.get(2)).toBe(3);
  });
});

describe('isEligible', () => {
  const map = new Map([[2, 3]]);

  it('excludes a gameweek before the manager joined', () => {
    expect(isEligible(map, 2, 2)).toBe(false);
  });

  it('includes the gameweek the manager joined for', () => {
    expect(isEligible(map, 2, 3)).toBe(true);
  });

  it('includes every later gameweek', () => {
    expect(isEligible(map, 2, 10)).toBe(true);
  });

  it('applies no restriction to an entry that is not in the map', () => {
    expect(isEligible(map, 99, 1)).toBe(true);
  });

  it('applies no restriction when there is no map at all', () => {
    expect(isEligible(undefined, 2, 1)).toBe(true);
  });
});
