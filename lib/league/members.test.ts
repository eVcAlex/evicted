import { describe, expect, it } from 'vitest';
import type { LeagueStandings } from '@/lib/fpl/schemas';
import { resolveMembers } from './members';

function standings(overrides: Partial<LeagueStandings>): LeagueStandings {
  return {
    league: { id: 79294, name: 'Evicted', start_event: 1 },
    standings: { results: [] },
    new_entries: { results: [] },
    ...overrides,
  };
}

describe('resolveMembers', () => {
  it('reads members from new_entries before the first scored gameweek', () => {
    const members = resolveMembers(
      standings({
        new_entries: {
          results: [
            {
              entry: 567357,
              entry_name: 'DEFCON',
              player_first_name: 'Finn',
              player_last_name: 'Taylor',
            },
          ],
        },
      }),
    );

    expect(members).toEqual([
      { entryId: 567357, managerName: 'Finn Taylor', teamName: 'DEFCON' },
    ]);
  });

  it('reads members from standings once gameweeks are scored', () => {
    const members = resolveMembers(
      standings({
        standings: {
          results: [
            { entry: 394534, entry_name: 'Høgh are you?', player_name: 'Alex McGuiness' },
          ],
        },
      }),
    );

    expect(members).toEqual([
      { entryId: 394534, managerName: 'Alex McGuiness', teamName: 'Høgh are you?' },
    ]);
  });

  it('merges both arrays when a new member joins a running league', () => {
    const members = resolveMembers(
      standings({
        standings: {
          results: [
            { entry: 394534, entry_name: 'Høgh are you?', player_name: 'Alex McGuiness' },
          ],
        },
        new_entries: {
          results: [
            {
              entry: 926697,
              entry_name: 'Durán Durán',
              player_first_name: 'Aidan',
              player_last_name: 'McGuiness',
            },
          ],
        },
      }),
    );

    expect(members.map((m) => m.entryId).sort()).toEqual([394534, 926697]);
  });

  it('does not duplicate a member present in both arrays', () => {
    const members = resolveMembers(
      standings({
        standings: {
          results: [
            { entry: 394534, entry_name: 'Høgh are you?', player_name: 'Alex McGuiness' },
          ],
        },
        new_entries: {
          results: [
            {
              entry: 394534,
              entry_name: 'Høgh are you?',
              player_first_name: 'Alex',
              player_last_name: 'McGuiness',
            },
          ],
        },
      }),
    );

    expect(members).toHaveLength(1);
  });

  it('returns an empty list for an empty league', () => {
    expect(resolveMembers(standings({}))).toEqual([]);
  });
});
