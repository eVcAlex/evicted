import type { Identity } from '@/lib/identity';
import type { DraftLeagueDetails } from './schemas';

export interface DraftMember extends Identity {
  /**
   * `league_entries[].id` — the stable key. This is what `matches[]` and
   * `standings[]` reference on the real API, and what every draft history
   * fetch is keyed by internally. NOT the same as `teamId` below.
   */
  entryId: number;
  /**
   * `league_entries[].entry_id` — the *team* id, only used to build
   * `/entry/{teamId}/history` request URLs. Null for the synthetic
   * "AVERAGE" benchmark entry every draft league gets once the draft
   * completes — it has no real team behind it. Confusing this with
   * `entryId` silently mis-keys every score.
   */
  teamId: number | null;
  shortName: string;
  joinedTime: string;
}

/**
 * Draft has one `league_entries` array (unlike classic's two-array
 * standings/new_entries merge — every draft member is fully known from the
 * moment they join, there's no "not yet scored" intermediate state the way
 * classic's `new_entries` represents).
 */
export function resolveDraftMembers(details: DraftLeagueDetails): DraftMember[] {
  return details.league_entries.map((entry) => ({
    entryId: entry.id,
    teamId: entry.entry_id,
    managerName:
      entry.player_first_name && entry.player_last_name
        ? `${entry.player_first_name} ${entry.player_last_name}`.trim()
        : 'Average',
    teamName: entry.entry_name ?? 'Average',
    shortName: entry.short_name,
    joinedTime: entry.joined_time,
  }));
}
