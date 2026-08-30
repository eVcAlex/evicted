import type { Balance } from './balances';

export interface Pot {
  /** Every confirmed buy-in plus every fine actually collected so far. */
  potPence: number;
  buyinsPaid: number;
  /** Current league members, not everyone who has ever owed the buy-in. */
  buyinsTotal: number;
  /** Unspent credit currently banked — physically in the account, so in the pot. */
  creditPence: number;
}

export function buildPot(balances: Balance[]): Pot {
  const current = balances.filter((balance) => !balance.departed);
  const creditPence = balances.reduce((sum, b) => sum + Math.max(b.creditPence, 0), 0);

  return {
    potPence: balances.reduce((sum, balance) => sum + balance.paidPence, 0) + creditPence,
    buyinsPaid: current.filter((balance) => !balance.buyinOwed).length,
    buyinsTotal: current.length,
    creditPence,
  };
}
