import { describe, expect, it } from 'vitest';
import type { GameweekResult } from '@/lib/ledger/store';
import { buildBalances } from './balances';

const members = [
  { entryId: 1, managerName: 'Finn Taylor', teamName: 'DEFCON', joinedTime: null },
  { entryId: 2, managerName: 'Joe Taylor', teamName: 'JT', joinedTime: null },
];

const allBoughtIn = new Set(members.map((m) => m.entryId));

const results = new Map<number, GameweekResult>([
  [1, { losers: [1], scores: { 1: 30 }, recordedAt: '2026-08-24T00:00:00Z' }],
  [2, { losers: [1], scores: { 1: 25 }, recordedAt: '2026-08-31T00:00:00Z' }],
  [3, { losers: [2], scores: { 2: 20 }, recordedAt: '2026-09-07T00:00:00Z' }],
]);

describe('buildBalances', () => {
  it('counts every gameweek a manager lost', () => {
    const balances = buildBalances({ members, results, paid: new Set(), buyins: allBoughtIn });
    const finn = balances.find((b) => b.member.entryId === 1);
    expect(finn?.lost).toEqual([1, 2]);
  });

  it('charges two pounds per unpaid gameweek', () => {
    const balances = buildBalances({ members, results, paid: new Set(), buyins: allBoughtIn });
    expect(balances.find((b) => b.member.entryId === 1)?.owedPence).toBe(400);
  });

  it('moves settled gameweeks from owed to paid', () => {
    const balances = buildBalances({
      members,
      results,
      paid: new Set(['1:1']),
      buyins: allBoughtIn,
    });
    const finn = balances.find((b) => b.member.entryId === 1);
    expect(finn?.owedPence).toBe(200);
    // 200 fine paid + the 2000 buy-in, already settled for everyone here.
    expect(finn?.paidPence).toBe(2200);
    expect(finn?.unpaid).toEqual([2]);
  });

  it('gives a manager who has never lost a zero balance once bought in', () => {
    const balances = buildBalances({
      members,
      results: new Map(),
      paid: new Set(),
      buyins: allBoughtIn,
    });
    expect(balances.every((b) => b.owedPence === 0)).toBe(true);
  });

  it('counts both managers when a gameweek was tied', () => {
    const tied = new Map([
      [1, { losers: [1, 2], scores: { 1: 30, 2: 30 }, recordedAt: '2026-08-24T00:00:00Z' }],
    ]);
    const balances = buildBalances({ members, results: tied, paid: new Set(), buyins: allBoughtIn });
    expect(balances.every((b) => b.owedPence === 200)).toBe(true);
  });

  it('orders by amount owed, highest first', () => {
    const balances = buildBalances({ members, results, paid: new Set(), buyins: allBoughtIn });
    expect(balances[0].member.entryId).toBe(1);
  });

  it('marks current members as still in the league', () => {
    const balances = buildBalances({ members, results, paid: new Set(), buyins: allBoughtIn });
    expect(balances.every((b) => b.departed === false)).toBe(true);
  });

  // Leaving the league does not settle the debt.
  it('keeps a manager who has left the league but still owes money', () => {
    const withLeaver = new Map(results);
    withLeaver.set(4, {
      losers: [99],
      scores: { 99: 12 },
      recordedAt: '2026-09-14T00:00:00Z',
    });

    const balances = buildBalances({
      members,
      results: withLeaver,
      paid: new Set(),
      buyins: allBoughtIn,
    });
    const leaver = balances.find((b) => b.member.entryId === 99);

    expect(leaver?.departed).toBe(true);
    expect(leaver?.owedPence).toBe(200);
    expect(leaver?.lost).toEqual([4]);
  });

  it('identifies a departed manager by entry id, the only name left', () => {
    const withLeaver = new Map([
      [1, { losers: [99], scores: { 99: 12 }, recordedAt: '2026-09-14T00:00:00Z' }],
    ]);

    const balances = buildBalances({
      members,
      results: withLeaver,
      paid: new Set(),
      buyins: allBoughtIn,
    });
    expect(balances.find((b) => b.departed)?.member.teamName).toBe('Entry 99');
  });

  it('lets a departed manager be marked as paid', () => {
    const withLeaver = new Map([
      [1, { losers: [99], scores: { 99: 12 }, recordedAt: '2026-09-14T00:00:00Z' }],
    ]);

    const balances = buildBalances({
      members,
      results: withLeaver,
      paid: new Set(['1:99']),
      buyins: allBoughtIn,
    });
    const leaver = balances.find((b) => b.member.entryId === 99);

    expect(leaver?.owedPence).toBe(0);
    expect(leaver?.paidPence).toBe(200);
  });

  it('does not resurrect an entry that merely appears in a gameweek score', () => {
    const withStranger = new Map([
      [1, { losers: [1], scores: { 1: 30, 77: 60 }, recordedAt: '2026-08-24T00:00:00Z' }],
    ]);

    const balances = buildBalances({
      members,
      results: withStranger,
      paid: new Set(),
      buyins: allBoughtIn,
    });
    expect(balances.some((b) => b.member.entryId === 77)).toBe(false);
  });

  describe('buy-in', () => {
    it('adds the buy-in to what a member owes until they pay it', () => {
      const balances = buildBalances({
        members,
        results: new Map(),
        paid: new Set(),
        buyins: new Set(),
      });
      expect(balances.find((b) => b.member.entryId === 1)?.owedPence).toBe(2000);
      expect(balances.find((b) => b.member.entryId === 1)?.buyinOwed).toBe(true);
    });

    it('moves the buy-in from owed to paid once recorded', () => {
      const balances = buildBalances({
        members,
        results: new Map(),
        paid: new Set(),
        buyins: new Set([1]),
      });
      const finn = balances.find((b) => b.member.entryId === 1);
      expect(finn?.owedPence).toBe(0);
      expect(finn?.paidPence).toBe(2000);
      expect(finn?.buyinOwed).toBe(false);
    });

    it('stacks with fine debt for a member who owes both', () => {
      const balances = buildBalances({
        members,
        results,
        paid: new Set(),
        buyins: new Set(),
      });
      expect(balances.find((b) => b.member.entryId === 1)?.owedPence).toBe(2400);
    });

    it('never charges a departed member a buy-in they were never asked for', () => {
      const withLeaver = new Map([
        [1, { losers: [99], scores: { 99: 12 }, recordedAt: '2026-09-14T00:00:00Z' }],
      ]);

      const balances = buildBalances({
        members,
        results: withLeaver,
        paid: new Set(),
        buyins: new Set(),
      });
      const leaver = balances.find((b) => b.member.entryId === 99);

      expect(leaver?.owedPence).toBe(200);
      expect(leaver?.buyinOwed).toBe(false);
    });
  });
});
