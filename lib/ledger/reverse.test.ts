import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@/lib/league/members';

const getPayments = vi.fn();
const appendPayment = vi.fn();
const setPaid = vi.fn();
const setBuyin = vi.fn();
const setCredit = vi.fn();
const getCredit = vi.fn();
const appendPending = vi.fn();

vi.mock('./store', () => ({
  getPayments, getCredit, appendPayment, setPaid, setBuyin, setCredit,
}));
vi.mock('@/lib/monzo/store', () => ({ appendPending }));

const { reversePayment } = await import('./reverse');

const members: Member[] = [{ entryId: 1, managerName: 'A', teamName: 'Team A', joinedTime: null }];

function logEntry(overrides = {}) {
  return {
    id: 'tx_1', entryId: 1, amountPence: 2000, source: 'monzo', receivedAt: 'then',
    allocation: { fineGameweeks: [3, 4], buyin: true, creditDeltaPence: 1200 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  getCredit.mockResolvedValue(new Map([[1, 1200]]));
  getPayments.mockResolvedValue([logEntry()]);
});

describe('reversePayment', () => {
  it('un-pays the fine gameweeks and the buy-in', async () => {
    await reversePayment('tx_1', members);
    expect(setPaid).toHaveBeenCalledWith(3, 1, false);
    expect(setPaid).toHaveBeenCalledWith(4, 1, false);
    expect(setBuyin).toHaveBeenCalledWith(1, false);
  });

  it('subtracts the payment’s credit delta from the current balance', async () => {
    await reversePayment('tx_1', members);
    expect(setCredit).toHaveBeenCalledWith(1, 0); // 1200 current − 1200 delta
  });

  it('drives the credit balance negative without cascading', async () => {
    getCredit.mockResolvedValue(new Map([[1, 400]]));
    await reversePayment('tx_1', members);
    expect(setCredit).toHaveBeenCalledWith(1, -800);
  });

  it('adds back credit the original payment spent', async () => {
    // The original allocation had a *negative* delta (it consumed banked
    // credit), so reversing it must return that credit, not take more away.
    getPayments.mockResolvedValue([
      logEntry({ allocation: { fineGameweeks: [3, 4], buyin: true, creditDeltaPence: -600 } }),
    ]);
    getCredit.mockResolvedValue(new Map([[1, 1200]]));

    await reversePayment('tx_1', members);

    expect(setCredit).toHaveBeenCalledWith(1, 1800); // 1200 current − (−600)
  });

  it('re-queues a "reversed" pending entry for the original member', async () => {
    await reversePayment('tx_1', members);
    expect(appendPending).toHaveBeenCalledWith(expect.objectContaining({
      id: 'reversed:tx_1', reason: 'reversed',
      candidates: [{ entryId: 1, teamName: 'Team A' }],
    }));
  });

  it('appends a reversal audit entry', async () => {
    await reversePayment('tx_1', members);
    expect(appendPayment).toHaveBeenCalledWith(expect.objectContaining({
      id: 'reversal:tx_1', source: 'reversal', entryId: 1,
      allocation: { fineGameweeks: [3, 4], buyin: true, creditDeltaPence: -1200 },
    }));
  });

  it('refuses a second reverse once a reversal entry already exists', async () => {
    getPayments.mockResolvedValue([
      logEntry(),
      { id: 'reversal:tx_1', entryId: 1, amountPence: 2000, source: 'reversal', receivedAt: 'then',
        allocation: { fineGameweeks: [3, 4], buyin: true, creditDeltaPence: -1200 } },
    ]);
    const result = await reversePayment('tx_1', members);
    expect(result).toEqual({ ok: false, reason: 'already reversed' });
    expect(setPaid).not.toHaveBeenCalled();
    expect(setBuyin).not.toHaveBeenCalled();
    expect(setCredit).not.toHaveBeenCalled();
    expect(appendPending).not.toHaveBeenCalled();
  });

  it('refuses an unknown payment id', async () => {
    expect(await reversePayment('nope', members)).toEqual({ ok: false, reason: 'not found' });
  });

  it('refuses to reverse a non-webhook entry', async () => {
    getPayments.mockResolvedValue([logEntry({ id: 'chase:x', source: 'credit-chase' })]);
    const result = await reversePayment('chase:x', members);
    expect(result.ok).toBe(false);
  });

  it('refuses rather than clobbering the balance when the credit read fails', async () => {
    // A degraded read would look like "credit is 0" and write an absolute
    // 0 − delta over a real balance, inventing an overdraft from stale data.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    getCredit.mockRejectedValue(new Error('store down'));

    const result = await reversePayment('tx_1', members);

    expect(result).toEqual({ ok: false, reason: 'store error' });
    expect(setCredit).not.toHaveBeenCalled();
    expect(appendPayment).not.toHaveBeenCalled();
    expect(appendPending).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('returns the typed union rather than throwing when the payment log read fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    getPayments.mockRejectedValue(new Error('store down'));

    expect(await reversePayment('tx_1', members)).toEqual({ ok: false, reason: 'store error' });

    logged.mockRestore();
  });
});
