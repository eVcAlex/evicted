import { describe, expect, it } from 'vitest';
import type { GameweekResult } from '@/lib/ledger/store';
import { buildBalances } from './balances';

const members = [
  { entryId: 1, managerName: 'Finn Taylor', teamName: 'DEFCON' },
  { entryId: 2, managerName: 'Joe Taylor', teamName: 'JT' },
];

const results = new Map<number, GameweekResult>([
  [1, { losers: [1], scores: { 1: 30 }, recordedAt: '2026-08-24T00:00:00Z' }],
  [2, { losers: [1], scores: { 1: 25 }, recordedAt: '2026-08-31T00:00:00Z' }],
  [3, { losers: [2], scores: { 2: 20 }, recordedAt: '2026-09-07T00:00:00Z' }],
]);

describe('buildBalances', () => {
  it('counts every gameweek a manager lost', () => {
    const balances = buildBalances({ members, results, paid: new Set() });
    const finn = balances.find((b) => b.member.entryId === 1);
    expect(finn?.lost).toEqual([1, 2]);
  });

  it('charges two pounds per unpaid gameweek', () => {
    const balances = buildBalances({ members, results, paid: new Set() });
    expect(balances.find((b) => b.member.entryId === 1)?.owedPence).toBe(400);
  });

  it('moves settled gameweeks from owed to paid', () => {
    const balances = buildBalances({ members, results, paid: new Set(['1:1']) });
    const finn = balances.find((b) => b.member.entryId === 1);
    expect(finn?.owedPence).toBe(200);
    expect(finn?.paidPence).toBe(200);
    expect(finn?.unpaid).toEqual([2]);
  });

  it('gives a manager who has never lost a zero balance', () => {
    const balances = buildBalances({
      members,
      results: new Map(),
      paid: new Set(),
    });
    expect(balances.every((b) => b.owedPence === 0)).toBe(true);
  });

  it('counts both managers when a gameweek was tied', () => {
    const tied = new Map([
      [1, { losers: [1, 2], scores: { 1: 30, 2: 30 }, recordedAt: '2026-08-24T00:00:00Z' }],
    ]);
    const balances = buildBalances({ members, results: tied, paid: new Set() });
    expect(balances.every((b) => b.owedPence === 200)).toBe(true);
  });

  it('orders by amount owed, highest first', () => {
    const balances = buildBalances({ members, results, paid: new Set() });
    expect(balances[0].member.entryId).toBe(1);
  });
});
