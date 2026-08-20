import { describe, expect, it } from 'vitest';
import { buildSummary } from './summary';

const members = [
  { entryId: 1, managerName: 'Finn Taylor', teamName: 'DEFCON', joinedTime: null },
  { entryId: 2, managerName: 'Joe Taylor', teamName: 'JT', joinedTime: null },
];

describe('buildSummary', () => {
  it('pairs each loser with their member record', () => {
    const summary = buildSummary({
      gameweek: 5,
      provisional: false,
      members,
      scores: [
        { entryId: 1, gross: 34, hits: 4, net: 30 },
        { entryId: 2, gross: 55, hits: 0, net: 55 },
      ],
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
      scores: [
        { entryId: 1, gross: 30, hits: 0, net: 30 },
        { entryId: 2, gross: 34, hits: 4, net: 30 },
      ],
    });

    expect(summary.losers).toHaveLength(2);
  });

  it('drops losers with no matching member record', () => {
    const summary = buildSummary({
      gameweek: 5,
      provisional: false,
      members,
      scores: [{ entryId: 99, gross: 10, hits: 0, net: 10 }],
    });

    expect(summary.losers).toEqual([]);
  });

  it('carries the provisional flag through', () => {
    const summary = buildSummary({
      gameweek: 5,
      provisional: true,
      members,
      scores: [{ entryId: 1, gross: 30, hits: 0, net: 30 }],
    });

    expect(summary.provisional).toBe(true);
  })
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
      scores: [
        { entryId: 1, gross: 0, hits: 0, net: 0 },
        { entryId: 2, gross: 0, hits: 0, net: 0 },
      ],
    });

    expect(summary.allTied).toBe(true);
    expect(summary.losers).toHaveLength(2);
  });

  it('does not flag a single score as a tie', () => {
    const summary = buildSummary({
      gameweek: 1,
      provisional: true,
      members,
      scores: [{ entryId: 1, gross: 0, hits: 0, net: 0 }],
    });

    expect(summary.allTied).toBe(false);
  });

  it('does not flag a genuine spread as a tie', () => {
    const summary = buildSummary({
      gameweek: 1,
      provisional: false,
      members,
      scores: [
        { entryId: 1, gross: 30, hits: 0, net: 30 },
        { entryId: 2, gross: 55, hits: 0, net: 55 },
      ],
    });

    expect(summary.allTied).toBe(false);
  });
});
