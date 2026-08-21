import { describe, expect, it } from 'vitest';
import type { GameweekScore } from './scoring';
import { buildSummary } from './summary';

const members = [
  { entryId: 1, managerName: 'Finn Taylor', teamName: 'DEFCON', joinedTime: null },
  { entryId: 2, managerName: 'Joe Taylor', teamName: 'JT', joinedTime: null },
];

/** `buildSummary` reads `entryId` and `net`; the rest is filler for the type. */
function score(entryId: number, net: number, extra: Partial<GameweekScore> = {}): GameweekScore {
  return { entryId, gross: net, hits: 0, net, bench: 0, ...extra };
}

describe('buildSummary', () => {
  it('pairs each loser with their member record', () => {
    const summary = buildSummary({
      gameweek: 5,
      provisional: false,
      members,
      scores: [score(1, 30), score(2, 55)],
    });

    expect(summary.losers).toHaveLength(1);
    expect(summary.losers[0].member.teamName).toBe('DEFCON');
    expect(summary.losers[0].score.net).toBe(30);
  });

  it('includes every tied manager', () => {
    const summary = buildSummary({
      gameweek: 5,
      provisional: false,
      members,
      scores: [score(1, 30), score(2, 30)],
    });

    expect(summary.losers).toHaveLength(2);
  });

  it('drops losers with no matching member record', () => {
    const summary = buildSummary({
      gameweek: 5,
      provisional: false,
      members,
      scores: [score(99, 10)],
    });

    expect(summary.losers).toEqual([]);
  });

  it('carries the provisional flag through', () => {
    const summary = buildSummary({
      gameweek: 5,
      provisional: true,
      members,
      scores: [score(1, 30)],
    });

    expect(summary.provisional).toBe(true);
  });

  // The deadline passes hours before the first match, so `is_current` flips
  // while every history is still empty. The card must have something to render
  // other than a heading with nothing under it.
  it('has no losers at all when nobody has a score yet', () => {
    const summary = buildSummary({
      gameweek: 1,
      provisional: true,
      members,
      scores: [],
    });

    expect(summary.losers).toEqual([]);
    expect(summary.allTied).toBe(false);
  });

  it('flags everyone being level, which is not everyone losing', () => {
    const summary = buildSummary({
      gameweek: 1,
      provisional: true,
      members,
      scores: [score(1, 0), score(2, 0)],
    });

    expect(summary.allTied).toBe(true);
    expect(summary.losers).toHaveLength(2);
  });

  it('does not flag a single score as a tie', () => {
    const summary = buildSummary({
      gameweek: 1,
      provisional: true,
      members,
      scores: [score(1, 0)],
    });

    expect(summary.allTied).toBe(false);
  });

  it('does not flag a genuine spread as a tie', () => {
    const summary = buildSummary({
      gameweek: 1,
      provisional: false,
      members,
      scores: [score(1, 30), score(2, 55)],
    });

    expect(summary.allTied).toBe(false);
  });

  describe('runnerUpNet', () => {
    it('is the lowest score not held by a loser', () => {
      const summary = buildSummary({
        gameweek: 5,
        provisional: false,
        members: [...members, { entryId: 3, managerName: 'X', teamName: 'X', joinedTime: null }],
        scores: [score(1, 20), score(2, 55), score(3, 40)],
      });

      expect(summary.runnerUpNet).toBe(40);
    });

    it('is null when nobody has a score', () => {
      const summary = buildSummary({
        gameweek: 1,
        provisional: true,
        members,
        scores: [],
      });

      expect(summary.runnerUpNet).toBeNull();
    });

    it('is null when every scorer is tied at the bottom', () => {
      const summary = buildSummary({
        gameweek: 1,
        provisional: false,
        members,
        scores: [score(1, 30), score(2, 30)],
      });

      expect(summary.runnerUpNet).toBeNull();
    });
  });
});
