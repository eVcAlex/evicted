import { describe, expect, it } from 'vitest';
import { buildSummary } from './summary';

const members = [
  { entryId: 1, managerName: 'Finn Taylor', teamName: 'DEFCON' },
  { entryId: 2, managerName: 'Joe Taylor', teamName: 'JT' },
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
  });
});
