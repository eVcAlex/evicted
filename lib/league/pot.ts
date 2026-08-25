import type { Balance } from './balances';

export interface Pot {
  /** Every confirmed buy-in plus every fine actually collected so far. */
  potPence: number;
  buyinsPaid: number;
  /** Current league members, not everyone who has ever owed the buy-in. */
  buyinsTotal: number;
}

export function buildPot(balances: Balance[]): Pot {
  const current = balances.filter((balance) => !balance.departed);

  return {
    potPence: balances.reduce((sum, balance) => sum + balance.paidPence, 0),
    buyinsPaid: current.filter((balance) => !balance.buyinOwed).length,
    buyinsTotal: current.length,
  };
}
