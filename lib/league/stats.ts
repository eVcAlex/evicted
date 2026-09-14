import type { EntryHistory } from '@/lib/fpl/schemas';
import type { GridResult } from '@/lib/gameweekResult';
import type { Identity } from '@/lib/identity';
import { lossesByEntry } from './history';

export interface HallOfShame {
  /** Everyone tied on the highest eviction count, and what that count is. */
  mostEvictions: { members: Identity[]; count: number } | null;
  /** The single lowest net score ever recorded, and who posted it. */
  worst: { member: Identity; gameweek: number; net: number } | null;
  /** Most consecutive *recorded* gameweeks a manager has avoided the bottom. */
  longestCleanRun: { member: Identity; weeks: number } | null;
  /**
   * The longest run of consecutive *recorded* gameweeks a manager has ever
   * finished bottom in, wherever in the season it fell — unlike
   * `longestCleanRun`, this is not scoped to a run still active today.
   */
  longestLosingStreak: {
    member: Identity;
    weeks: number;
    fromGameweek: number;
    toGameweek: number;
  } | null;
  /**
   * The single gameweek where one manager left the most points on the bench.
   * Null unless `histories` is supplied: the ledger only keeps net scores, so
   * bench detail has to be fetched separately (see `buildHallOfShame`).
   */
  worstBenchHaul: { member: Identity; gameweek: number; bench: number } | null;
  /**
   * The sharpest week-on-week collapse: the biggest drop in one manager's net
   * score from one gameweek they played to the very next one they played.
   */
  biggestBottler: {
    member: Identity;
    fromGameweek: number;
    toGameweek: number;
    drop: number;
  } | null;
}

/**
 * Season-long stats derived entirely from the recorded ledger — no extra FPL
 * fetches. A manager who has left the league (and so is missing from
 * `members`) is dropped from every stat here rather than resurrected as a
 * stub; `balances.ts` does that resurrection where it matters (their debt
 * outlives their membership), but a hall-of-shame entry for someone nobody
 * can identify any more is just noise.
 */
export function buildHallOfShame(params: {
  members: Identity[];
  results: Map<number, GridResult>;
  /**
   * Per-manager FPL history, keyed by entry id. Optional: only the classic
   * season page fetches it (for `worstBenchHaul`); draft reuses this builder
   * without it and simply gets a null bench haul, keeping its own bench award.
   */
  histories?: Map<number, EntryHistory>;
}): HallOfShame {
  const { members, results, histories } = params;
  const byEntryId = new Map(members.map((m) => [m.entryId, m]));

  return {
    mostEvictions: mostEvictions(byEntryId, results),
    worst: worstSingleScore(byEntryId, results),
    longestCleanRun: longestCleanRun(members, results),
    longestLosingStreak: longestLosingStreak(members, results),
    worstBenchHaul: worstBenchHaul(byEntryId, results, histories),
    biggestBottler: biggestBottler(members, results),
  };
}

function mostEvictions(
  byEntryId: Map<number, Identity>,
  results: Map<number, GridResult>,
): HallOfShame['mostEvictions'] {
  const losses = lossesByEntry(results);
  let count = 0;
  for (const gameweeks of losses.values()) {
    count = Math.max(count, gameweeks.length);
  }
  if (count === 0) return null;

  const tied = [...losses.entries()]
    .filter(([, gameweeks]) => gameweeks.length === count)
    .flatMap(([entryId]) => byEntryId.get(entryId) ?? []);

  return tied.length > 0 ? { members: tied, count } : null;
}

function worstSingleScore(
  byEntryId: Map<number, Identity>,
  results: Map<number, GridResult>,
): HallOfShame['worst'] {
  let worst: HallOfShame['worst'] = null;

  for (const [gameweek, result] of results) {
    for (const entryId of result.losers) {
      const net = result.scores[entryId];
      const member = byEntryId.get(entryId);
      if (net === undefined || !member) continue;
      if (!worst || net < worst.net) {
        worst = { member, gameweek, net };
      }
    }
  }

  return worst;
}

/**
 * The fattest single-gameweek bench across the season. Scoped to settled
 * gameweeks by iterating `results`, and to a manager's *membership* of each
 * one by only considering entry ids present in that gameweek's scores - the
 * same ledger-backed membership filter `worstSingleScore` relies on, so a
 * manager's bench from before they joined the league never counts.
 *
 * A gameweek a manager played Bench Boost is excluded entirely: FPL still
 * reports `points_on_bench` for it, but those points were added to the team
 * total, not wasted, so it is not a "haul" at all.
 */
function worstBenchHaul(
  byEntryId: Map<number, Identity>,
  results: Map<number, GridResult>,
  histories?: Map<number, EntryHistory>,
): HallOfShame['worstBenchHaul'] {
  if (!histories) return null;
  let worst: HallOfShame['worstBenchHaul'] = null;

  for (const [gameweek, result] of results) {
    for (const entryId of Object.keys(result.scores).map(Number)) {
      const member = byEntryId.get(entryId);
      if (!member) continue;
      const history = histories.get(entryId);
      const row = history?.current.find((e) => e.event === gameweek);
      if (!row) continue;
      const benchBoosted = history?.chips?.some(
        (chip) => chip.name === 'bboost' && chip.event === gameweek,
      );
      if (benchBoosted) continue;
      if (!worst || row.points_on_bench > worst.bench) {
        worst = { member, gameweek, bench: row.points_on_bench };
      }
    }
  }

  return worst;
}

/**
 * The biggest fall in net score between two gameweeks a manager actually
 * played. Weeks they sat out are skipped rather than treated as a zero, so the
 * "next" week is their next real one - the same membership-aware walk
 * `longestCleanRun` does. Only genuine drops count; a season of only rises
 * yields null.
 */
function biggestBottler(
  members: Identity[],
  results: Map<number, GridResult>,
): HallOfShame['biggestBottler'] {
  const gameweeksAsc = [...results.keys()].sort((a, b) => a - b);
  let worst: HallOfShame['biggestBottler'] = null;

  for (const member of members) {
    let previous: { gameweek: number; net: number } | null = null;
    for (const gameweek of gameweeksAsc) {
      const net = results.get(gameweek)!.scores[member.entryId];
      if (net === undefined) continue;
      if (previous) {
        const drop = previous.net - net;
        if (drop > 0 && (!worst || drop > worst.drop)) {
          worst = { member, fromGameweek: previous.gameweek, toGameweek: gameweek, drop };
        }
      }
      previous = { gameweek, net };
    }
  }

  return worst;
}

/**
 * Whoever has the sole longest active run. Early season, before anyone has
 * ever finished bottom, every member is tied on the same count - crowning one
 * of them arbitrarily would claim a lead nobody actually holds, so a tie for
 * the top spot (two or more, however many weeks) hides the row entirely
 * rather than picking a name.
 */
function longestCleanRun(
  members: Identity[],
  results: Map<number, GridResult>,
): HallOfShame['longestCleanRun'] {
  const gameweeksDesc = [...results.keys()].sort((a, b) => b - a);
  if (gameweeksDesc.length === 0) return null;

  let bestWeeks = 0;
  let leaders: Identity[] = [];

  for (const member of members) {
    let weeks = 0;
    for (const gameweek of gameweeksDesc) {
      const result = results.get(gameweek)!;
      // Not yet a member that gameweek: skip it without breaking the streak.
      if (!(member.entryId in result.scores)) continue;
      if (result.losers.includes(member.entryId)) break;
      weeks += 1;
    }
    if (weeks === 0) continue;
    if (weeks > bestWeeks) {
      bestWeeks = weeks;
      leaders = [member];
    } else if (weeks === bestWeeks) {
      leaders.push(member);
    }
  }

  return leaders.length === 1 ? { member: leaders[0], weeks: bestWeeks } : null;
}

/**
 * The single worst run anywhere in the season, not just one still ongoing —
 * the mirror image of `longestCleanRun`'s walk, but scanning ascending for a
 * streak of eviction weeks instead of descending for one still unbroken.
 * Ties keep whichever streak was found first, the same "first record wins"
 * rule `worstSingleScore` and `biggestBottler` use, since this crowns a
 * single record rather than a leaderboard position.
 */
function longestLosingStreak(
  members: Identity[],
  results: Map<number, GridResult>,
): HallOfShame['longestLosingStreak'] {
  const gameweeksAsc = [...results.keys()].sort((a, b) => a - b);
  let best: HallOfShame['longestLosingStreak'] = null;

  for (const member of members) {
    let weeks = 0;
    let from = 0;
    for (const gameweek of gameweeksAsc) {
      const result = results.get(gameweek)!;
      // Not yet a member that gameweek: skip it without breaking the streak.
      if (!(member.entryId in result.scores)) continue;
      if (!result.losers.includes(member.entryId)) {
        weeks = 0;
        continue;
      }
      if (weeks === 0) from = gameweek;
      weeks += 1;
      if (!best || weeks > best.weeks) {
        best = { member, weeks, fromGameweek: from, toGameweek: gameweek };
      }
    }
  }

  return best;
}
