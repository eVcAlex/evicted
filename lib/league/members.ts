import type { LeagueStandings } from '@/lib/fpl/schemas';

export interface Member {
  entryId: number;
  managerName: string;
  teamName: string;
}

/**
 * FPL reports league members in two different arrays with two different name
 * shapes. Before a league's first scored gameweek everyone sits in
 * `new_entries`; afterwards they move to `standings`. A league that gains a
 * member mid-season has both populated at once.
 */
export function resolveMembers(standings: LeagueStandings): Member[] {
  const byEntryId = new Map<number, Member>();

  for (const row of standings.standings.results) {
    byEntryId.set(row.entry, {
      entryId: row.entry,
      managerName: row.player_name,
      teamName: row.entry_name,
    });
  }

  for (const row of standings.new_entries.results) {
    if (byEntryId.has(row.entry)) continue;
    byEntryId.set(row.entry, {
      entryId: row.entry,
      managerName: `${row.player_first_name} ${row.player_last_name}`,
      teamName: row.entry_name,
    });
  }

  return [...byEntryId.values()];
}
