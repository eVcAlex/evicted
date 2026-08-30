import { describe, expect, it } from 'vitest';
import { planWaterfall } from './waterfall';

describe('planWaterfall', () => {
  it('banks a payment when nothing is owed', () => {
    expect(planWaterfall({ amountPence: 600, unpaidFines: [], buyinPaid: true, creditPence: 0 }))
      .toEqual({ fineGameweeks: [], buyin: false, creditDeltaPence: 600 });
  });

  it('pays the oldest unpaid fines first, £2 each', () => {
    expect(planWaterfall({ amountPence: 200, unpaidFines: [3, 5], buyinPaid: true, creditPence: 0 }))
      .toEqual({ fineGameweeks: [3], buyin: false, creditDeltaPence: 0 });
  });

  it('never pays more fines than are unpaid, banking the rest', () => {
    expect(planWaterfall({ amountPence: 2000, unpaidFines: [3], buyinPaid: true, creditPence: 0 }))
      .toEqual({ fineGameweeks: [3], buyin: false, creditDeltaPence: 1800 });
  });

  it('flips the buy-in when £20 is available after fines', () => {
    expect(planWaterfall({ amountPence: 2000, unpaidFines: [], buyinPaid: false, creditPence: 0 }))
      .toEqual({ fineGameweeks: [], buyin: true, creditDeltaPence: 0 });
  });

  it('leaves the buy-in unflipped when less than £20 remains, banking it', () => {
    expect(planWaterfall({ amountPence: 2000, unpaidFines: [3, 4], buyinPaid: false, creditPence: 0 }))
      .toEqual({ fineGameweeks: [3, 4], buyin: false, creditDeltaPence: 1600 });
  });

  it('does not re-flip a buy-in that is already paid', () => {
    expect(planWaterfall({ amountPence: 2000, unpaidFines: [], buyinPaid: true, creditPence: 0 }))
      .toEqual({ fineGameweeks: [], buyin: false, creditDeltaPence: 2000 });
  });

  it('spends existing credit plus the payment to buy in', () => {
    expect(planWaterfall({ amountPence: 500, unpaidFines: [], buyinPaid: false, creditPence: 1500 }))
      .toEqual({ fineGameweeks: [], buyin: true, creditDeltaPence: -1500 });
  });

  it('reconciles pre-existing credit against unpaid fines (post-outage)', () => {
    expect(planWaterfall({ amountPence: 200, unpaidFines: [3, 4, 5, 6], buyinPaid: true, creditPence: 600 }))
      .toEqual({ fineGameweeks: [3, 4, 5, 6], buyin: false, creditDeltaPence: -600 });
  });

  it('only spends the positive part of credit; an overdraft survives', () => {
    expect(planWaterfall({ amountPence: 1000, unpaidFines: [], buyinPaid: true, creditPence: -800 }))
      .toEqual({ fineGameweeks: [], buyin: false, creditDeltaPence: 1000 });
  });
});
