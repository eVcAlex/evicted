import { describe, expect, it } from 'vitest';
import type { Balance } from './balances';
import { buildPot } from './pot';

const members = [
  { entryId: 1, managerName: 'Finn Taylor', teamName: 'DEFCON', joinedTime: null },
  { entryId: 2, managerName: 'Joe Taylor', teamName: 'JT', joinedTime: null },
];

function balance(entryId: number, overrides: Partial<Balance> = {}): Balance {
  return {
    member: members.find((m) => m.entryId === entryId)!,
    lost: [],
    unpaid: [],
    owedPence: 0,
    paidPence: 0,
    departed: false,
    buyinOwed: true,
    ...overrides,
  };
}

describe('buildPot', () => {
  it('sums what has actually been paid in, fines and buy-ins alike', () => {
    const pot = buildPot([
      balance(1, { paidPence: 2000, buyinOwed: false }),
      balance(2, { paidPence: 200 }),
    ]);
    expect(pot.potPence).toBe(2200);
  });

  it('counts how many current members have paid their buy-in', () => {
    const pot = buildPot([
      balance(1, { buyinOwed: false }),
      balance(2, { buyinOwed: true }),
    ]);
    expect(pot.buyinsPaid).toBe(1);
    expect(pot.buyinsTotal).toBe(2);
  });

  it('excludes a departed member from the buy-in count', () => {
    const pot = buildPot([
      balance(1, { buyinOwed: false }),
      balance(2, { departed: true, buyinOwed: false }),
    ]);
    expect(pot.buyinsTotal).toBe(1);
  });
});
