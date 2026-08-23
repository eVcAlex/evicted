import type { LeagueStandings } from '@/lib/fpl/schemas';
import type { Identity } from '@/lib/identity';

export interface Member extends Identity {
  /**
   * When this manager joined *this league*, ISO 8601, or null when FPL does not
   * tell us. Only `new_entries.results` rows carry it; a member who has already
   * been scored once appears in `standings.results`, which does not.
   */
  joinedTime: string | null;
}

/**
 * FPL reports league members in two different arrays with two different name
 * shapes. Before a league's first scored gameweek everyone sits in
 * `new_entries`; afterwards they move to `standings`. A league that gains a
 * member mid-season has both populated at once.
 *
 * `standings` wins on name, but `new_entries` is the only source of
 * `joined_time`, so a member present in both keeps the join time.
 */
export function resolveMembers(standings: LeagueStandings): Member[] {
  const byEntryId = new Map<number, Member>();

  for (const row of standings.standings.results) {
    byEntryId.set(row.entry, {
      entryId: row.entry,
      managerName: row.player_name,
      teamName: row.entry_name,
      joinedTime: null,
    });
  }

  for (const row of standings.new_entries.results) {
    const existing = byEntryId.get(row.entry);
    if (existing) {
      existing.joinedTime = row.joined_time;
      continue;
    }

    byEntryId.set(row.entry, {
      entryId: row.entry,
      managerName: `${row.player_first_name} ${row.player_last_name}`,
      teamName: row.entry_name,
      joinedTime: row.joined_time,
    });
  }

  return [...byEntryId.values()];
}
