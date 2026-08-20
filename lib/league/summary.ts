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

  return { gameweek, provisional, losers, allTied };
}
