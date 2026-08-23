import type { DraftMember } from './members';
import type { DraftStanding } from './schemas';

export interface StandingsRow {
  member: DraftMember;
  rank: number | null;
  won: number;
  drawn: number;
  lost: number;
  pointsFor: number;
  pointsAgainst: number;
  total: number;
}

/**
 * One row per league member, joined to their `standings[]` entry by
 * `entryId` (the API's `league_entry` field — not `teamId`). Real teams sort
 * by rank, nulls last and stable on original join order (the whole preseason,
 * every rank is null). The synthetic "AVERAGE" benchmark member (`teamId ===
 * null`) is always pinned to the very last row — it isn't a competitor, so a
 * rank or tiebreak would never apply to it anyway.
 */
export function buildStandingsRows(
  members: DraftMember[],
  standings: DraftStanding[],
): StandingsRow[] {
  const byEntryId = new Map(standings.map((s) => [s.league_entry, s]));

  const rows = members.flatMap((member) => {
    const standing = byEntryId.get(member.entryId);
    if (!standing) return [];
    return [
      {
        member,
        rank: standing.rank,
        won: standing.matches_won,
        drawn: standing.matches_drawn,
        lost: standing.matches_lost,
        pointsFor: standing.points_for,
        pointsAgainst: standing.points_against,
        total: standing.total,
      },
    ];
  });

  return rows.sort((a, b) => {
    if (a.member.teamId === null) return 1;
    if (b.member.teamId === null) return -1;
    return (a.rank ?? Infinity) - (b.rank ?? Infinity);
  });
}
