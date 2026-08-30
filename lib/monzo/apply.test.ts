import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@/lib/league/members';

const safeGetBuyins = vi.fn();
const safeGetPaid = vi.fn();
const safeGetResults = vi.fn();
const safeGetCredit = vi.fn();
const setPaid = vi.fn();
const setBuyin = vi.fn();
const setCredit = vi.fn();
const appendPayment = vi.fn();

vi.mock('@/lib/ledger/safe', () => ({ safeGetBuyins, safeGetPaid, safeGetResults, safeGetCredit }));
vi.mock('@/lib/ledger/store', () => ({
  setPaid, setBuyin, setCredit, appendPayment,
  paidKey: (gameweek: number, entryId: number) => `${gameweek}:${entryId}`,
}));

const { applyPayment } = await import('./apply');

function member(entryId: number, teamName: string): Member {
  return { entryId, managerName: teamName, teamName, joinedTime: null };
}
const members: Member[] = [member(1, 'Team A')];

function loss(gw: number) {
  return [gw, { losers: [1], scores: { 1: -10 }, recordedAt: '' }] as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  safeGetPaid.mockResolvedValue({ paid: new Set(), degraded: false });
  safeGetBuyins.mockResolvedValue({ buyins: new Set([1]), degraded: false });
  safeGetResults.mockResolvedValue({ results: new Map(), degraded: false });
  safeGetCredit.mockResolvedValue({ credit: new Map(), degraded: false });
});

describe('applyPayment', () => {
  it('banks a payment as credit when nothing is owed', async () => {
    const allocation = await applyPayment({
      entryId: 1, amountPence: 600, txId: 'tx_1', receivedAt: 'now', members,
    });
    expect(allocation).toEqual({ fineGameweeks: [], buyin: false, creditDeltaPence: 600 });
    expect(setCredit).toHaveBeenCalledWith(1, 600);
    expect(setPaid).not.toHaveBeenCalled();
  });

  it('pays the oldest fines and banks the remainder', async () => {
    safeGetResults.mockResolvedValue({ results: new Map([loss(3), loss(5)]), degraded: false });
    const allocation = await applyPayment({
      entryId: 1, amountPence: 600, txId: 'tx_2', receivedAt: 'now', members,
    });
    expect(allocation.fineGameweeks).toEqual([3, 5]);
    expect(setPaid).toHaveBeenCalledWith(3, 1, true);
    expect(setPaid).toHaveBeenCalledWith(5, 1, true);
    expect(setCredit).toHaveBeenCalledWith(1, 200);
  });

  it('flips the buy-in for a £20 payment from someone who owes no fines', async () => {
    safeGetBuyins.mockResolvedValue({ buyins: new Set(), degraded: false });
    const allocation = await applyPayment({
      entryId: 1, amountPence: 2000, txId: 'tx_3', receivedAt: 'now', members,
    });
    expect(allocation.buyin).toBe(true);
    expect(setBuyin).toHaveBeenCalledWith(1, true);
  });

  it('never flips the buy-in for an entry that is not in the member list', async () => {
    safeGetBuyins.mockResolvedValue({ buyins: new Set(), degraded: false });
    const allocation = await applyPayment({
      entryId: 999, amountPence: 2000, txId: 'tx_absent', receivedAt: 'now', members: [],
    });
    expect(allocation.buyin).toBe(false);
    expect(setBuyin).not.toHaveBeenCalled();
  });

  it('writes a payment-log entry with the allocation', async () => {
    await applyPayment({ entryId: 1, amountPence: 600, txId: 'tx_4', receivedAt: '2026-08-30T00:00:00Z', members });
    expect(appendPayment).toHaveBeenCalledWith({
      id: 'tx_4', entryId: 1, amountPence: 600, source: 'monzo',
      receivedAt: '2026-08-30T00:00:00Z',
      allocation: { fineGameweeks: [], buyin: false, creditDeltaPence: 600 },
    });
  });

  it('logs rather than throws when a store write fails', async () => {
    setCredit.mockRejectedValue(new Error('store down'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const allocation = await applyPayment({
      entryId: 1, amountPence: 600, txId: 'tx_5', receivedAt: 'now', members,
    });
    expect(allocation.creditDeltaPence).toBe(600);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
