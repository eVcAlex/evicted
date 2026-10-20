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
/**
 * FPL's standings endpoint has been seen returning a truncated, partly
 * duplicated page (2 rows for a league of 5+). Naming a loser from that would
 * be wrong, and a recorded row is permanent, so a member list that has lost
 * more than a quarter of the most recently recorded gameweek's field is
 * treated as bad data. One person leaving does not trip it.
 *
 * ponytail: no baseline before the first recorded gameweek, so a truncated
 * response then goes undetected. Pin entry ids in config if that bites.
 */
export function isTruncatedLeague(
  members: Member[],
  results: Map<number, { scores: Record<number, number> }>,
): boolean {
  if (results.size === 0) return false;
  const latest = results.get(Math.max(...results.keys()))!;
  return members.length * 4 < Object.keys(latest.scores).length * 3;
}

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
