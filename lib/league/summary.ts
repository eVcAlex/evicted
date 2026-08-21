import type { Member } from './members';
import { findLosers, type GameweekScore } from './scoring';

export interface LoserSummary {
  gameweek: number;
  provisional: boolean;
  /**
   * Every manager tied at the lowest net score. Empty when nobody has a score
   * for the gameweek yet — the deadline passes hours before the first match.
   */
  losers: Array<{ member: Member; score: GameweekScore }>;
  /**
   * True when more than one manager has a score and every one of them is the
   * same. While the gameweek is still provisional this is the "everyone is on
   * zero" state, which is not a nine-way eviction.
   */
  allTied: boolean;
  /**
   * The lowest net score *not* held by a loser — how far clear of the bottom
   * the next-worst manager finished. `null` when there is no such manager
   * (nobody scored, or everyone is tied at the bottom).
   */
  runnerUpNet: number | null;
}

export function buildSummary(params: {
  gameweek: number;
  provisional: boolean;
  members: Member[];
  scores: GameweekScore[];
}): LoserSummary {
  const { gameweek, provisional, members, scores } = params;
  const membersById = new Map(members.map((m) => [m.entryId, m]));
  const scoresById = new Map(scores.map((s) => [s.entryId, s]));

  const losers = findLosers(scores).flatMap((entryId) => {
    const member = membersById.get(entryId);
    const score = scoresById.get(entryId);
    if (!member || !score) return [];
    return [{ member, score }];
  });

  const allTied =
    scores.length > 1 && scores.every((score) => score.net === scores[0].net);

  const loserIds = new Set(losers.map(({ member }) => member.entryId));
  const runnerUpNets = scores
    .filter((score) => !loserIds.has(score.entryId))
    .map((score) => score.net);
  const runnerUpNet = runnerUpNets.length > 0 ? Math.min(...runnerUpNets) : null;

  return { gameweek, provisional, losers, allTied, runnerUpNet };
}
