import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@/lib/league/members';

const getPayments = vi.fn();
const appendPayment = vi.fn();
const setPaid = vi.fn();
const setBuyin = vi.fn();
const setCredit = vi.fn();
const safeGetCredit = vi.fn();
const appendPending = vi.fn();

vi.mock('./store', () => ({ getPayments, appendPayment, setPaid, setBuyin, setCredit }));
vi.mock('./safe', () => ({ safeGetCredit }));
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
  safeGetCredit.mockResolvedValue({ credit: new Map([[1, 1200]]), degraded: false });
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
    safeGetCredit.mockResolvedValue({ credit: new Map([[1, 400]]), degraded: false });
    await reversePayment('tx_1', members);
    expect(setCredit).toHaveBeenCalledWith(1, -800);
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
      source: 'reversal', entryId: 1,
      allocation: { fineGameweeks: [3, 4], buyin: true, creditDeltaPence: -1200 },
    }));
  });

  it('refuses an unknown payment id', async () => {
    expect(await reversePayment('nope', members)).toEqual({ ok: false, reason: 'not found' });
  });

  it('refuses to reverse a non-webhook entry', async () => {
    getPayments.mockResolvedValue([logEntry({ id: 'chase:x', source: 'credit-chase' })]);
    const result = await reversePayment('chase:x', members);
    expect(result.ok).toBe(false);
  });
});
