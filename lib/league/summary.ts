import type { Member } from './members';
import { findLosers, type GameweekScore } from './scoring';

export interface LoserSummary {
  gameweek: number;
  provisional: boolean;
  losers: Array<{ member: Member; score: GameweekScore }>;
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

  return { gameweek, provisional, losers };
}
