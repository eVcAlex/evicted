import type { Bootstrap } from '@/lib/fpl/schemas';
import type { Member } from './members';

/**
 * The first gameweek a manager can be fined for.
 *
 * `history.current[]` is not the answer: it starts at the manager's first
 * **FPL** gameweek, not their first gameweek in *this* league. Someone who has
 * played FPL since GW1 but joined this league at GW10 has nine gameweeks of
 * history that predate their membership, and fining them for those weeks would
 * write nine wrong rows into a ledger that is never rewritten.
 *
 * The join time is mapped to the first gameweek whose deadline had not yet
 * passed when they joined. A manager who joins after a deadline could not set a
 * team as a member of this league for that gameweek, so that gameweek is not
 * theirs to lose. This is the conservative reading of "the gameweek during
 * which they joined": it never fines someone for a week they spent partly
 * outside the league.
 *
 * @param startEvent the league's own `start_event` — nobody is liable before it
 */
export function joinGameweek(
  bootstrap: Bootstrap,
  joinedTime: string | null,
  startEvent: number,
): number {
  if (!joinedTime) return startEvent;

  const joined = Date.parse(joinedTime);
  if (Number.isNaN(joined)) return startEvent;

  const upcoming = [...bootstrap.events]
    .sort((a, b) => a.id - b.id)
    .find((event) => Date.parse(event.deadline_time) > joined);

  // Joined after the final deadline of the season: liable for nothing.
  if (!upcoming) return Number.POSITIVE_INFINITY;

  return Math.max(startEvent, upcoming.id);
}

/**
 * First eligible gameweek per entry id.
 *
 * A member known only from `standings.results` has no `joined_time` — FPL only
 * supplies it on `new_entries.results`, and a member leaves `new_entries` as
 * soon as one gameweek has been scored for them. For those members we fall back
 * to the league's `start_event`, which is the tightest lower bound FPL gives
 * us. The alternative — treating an unknown join time as "not provably a
 * member" — would make every manager permanently unfineable the moment the
 * league's first gameweek is scored, because at that point `new_entries` is
 * empty and *nobody* has a `joined_time` any more.
 *
 * The residual risk is a mid-season joiner who has already moved into
 * `standings` before their first gameweek is recorded. It is bounded: earlier
 * gameweeks were recorded before they joined and `saveResult` never rewrites a
 * recorded gameweek, and they still need a `history.current[]` entry for the
 * gameweek to be scored at all.
 */
export function eligibleFromByEntry(params: {
  bootstrap: Bootstrap;
  members: Member[];
  startEvent: number;
}): Map<number, number> {
  const { bootstrap, members, startEvent } = params;

  return new Map(
    members.map((member) => [
      member.entryId,
      joinGameweek(bootstrap, member.joinedTime, startEvent),
    ]),
  );
}

/**
 * Whether an entry was a member of the league for the given gameweek.
 *
 * An entry absent from the map carries no restriction. That keeps the parameter
 * optional at the edges — a caller that has not resolved eligibility gets the
 * old behaviour rather than an empty page.
 */
export function isEligible(
  eligibleFrom: Map<number, number> | undefined,
  entryId: number,
  gameweek: number,
): boolean {
  const from = eligibleFrom?.get(entryId);
  return from === undefined || gameweek >= from;
}
