import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@/lib/league/members';

const safeGetBuyins = vi.fn();
const safeGetPaid = vi.fn();
const safeGetResults = vi.fn();
const safeGetCredit = vi.fn();
const safeGetPayments = vi.fn();
const setPaid = vi.fn();
const setBuyin = vi.fn();
const setCredit = vi.fn();
const appendPayment = vi.fn();

vi.mock('@/lib/ledger/safe', () => ({
  safeGetBuyins, safeGetPaid, safeGetResults, safeGetCredit, safeGetPayments,
}));
vi.mock('@/lib/ledger/store', () => ({
  setPaid, setBuyin, setCredit, appendPayment,
  paidKey: (gameweek: number, entryId: number) => `${gameweek}:${entryId}`,
}));

const { applyPayment } = await import('./apply');

function member(entryId: number, teamName: string): Member {
  return { entryId, managerName: teamName, teamName, joinedTime: null };
}
const members: Member[] = [member(1, 'Team A')];

function loss(gw: number, who = 1) {
  return [gw, { losers: [who], scores: { [who]: -10 }, recordedAt: '' }] as const;
}

function expectNoWrites() {
  expect(setPaid).not.toHaveBeenCalled();
  expect(setBuyin).not.toHaveBeenCalled();
  expect(setCredit).not.toHaveBeenCalled();
  expect(appendPayment).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  safeGetPaid.mockResolvedValue({ paid: new Set(), degraded: false });
  safeGetBuyins.mockResolvedValue({ buyins: new Set([1]), degraded: false });
  safeGetResults.mockResolvedValue({ results: new Map(), degraded: false });
  safeGetCredit.mockResolvedValue({ credit: new Map(), degraded: false });
  safeGetPayments.mockResolvedValue({ payments: [], degraded: false });
});

describe('applyPayment', () => {
  it('banks a payment as credit when nothing is owed', async () => {
    const result = await applyPayment({
      entryId: 1, amountPence: 600, txId: 'tx_1', receivedAt: 'now', members,
    });
    expect(result).toEqual({
      applied: true,
      allocation: { fineGameweeks: [], buyin: false, creditDeltaPence: 600 },
    });
    expect(setCredit).toHaveBeenCalledWith(1, 600);
    expect(setPaid).not.toHaveBeenCalled();
  });

  it('pays the oldest fines and banks the remainder', async () => {
    safeGetResults.mockResolvedValue({ results: new Map([loss(3), loss(5)]), degraded: false });
    const result = await applyPayment({
      entryId: 1, amountPence: 600, txId: 'tx_2', receivedAt: 'now', members,
    });
    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.allocation.fineGameweeks).toEqual([3, 5]);
    expect(setPaid).toHaveBeenCalledWith(3, 1, true);
    expect(setPaid).toHaveBeenCalledWith(5, 1, true);
    expect(setCredit).toHaveBeenCalledWith(1, 200);
  });

  it('flips the buy-in for a £20 payment from someone who owes no fines', async () => {
    safeGetBuyins.mockResolvedValue({ buyins: new Set(), degraded: false });
    const result = await applyPayment({
      entryId: 1, amountPence: 2000, txId: 'tx_3', receivedAt: 'now', members,
    });
    expect(result.applied).toBe(true);
    if (!result.applied) return;
    expect(result.allocation.buyin).toBe(true);
    expect(setBuyin).toHaveBeenCalledWith(1, true);
  });

  it('writes a payment-log entry with the allocation', async () => {
    await applyPayment({ entryId: 1, amountPence: 600, txId: 'tx_4', receivedAt: '2026-08-30T00:00:00Z', members });
    expect(appendPayment).toHaveBeenCalledWith({
      id: 'tx_4', entryId: 1, amountPence: 600, source: 'monzo',
      receivedAt: '2026-08-30T00:00:00Z',
      allocation: { fineGameweeks: [], buyin: false, creditDeltaPence: 600 },
    });
  });

  it('reports a partial write rather than throwing when a store write fails', async () => {
    setCredit.mockRejectedValue(new Error('store down'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await applyPayment({
      entryId: 1, amountPence: 600, txId: 'tx_5', receivedAt: 'now', members,
    });
    expect(result).toEqual({ applied: false, reason: 'partial write' });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  describe('degraded reads', () => {
    const getters = [
      ['paid', safeGetPaid, { paid: new Set(), degraded: true }],
      ['results', safeGetResults, { results: new Map(), degraded: true }],
      ['buyins', safeGetBuyins, { buyins: new Set(), degraded: true }],
      ['credit', safeGetCredit, { credit: new Map(), degraded: true }],
      ['payments', safeGetPayments, { payments: [], degraded: true }],
    ] as const;

    for (const [name, getter, degradedValue] of getters) {
      it(`refuses to write when ${name} is degraded`, async () => {
        const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
        getter.mockResolvedValue(degradedValue);

        const result = await applyPayment({
          entryId: 1, amountPence: 600, txId: 'tx_degraded', receivedAt: 'now', members,
        });

        expect(result).toEqual({ applied: false, reason: 'ledger degraded' });
        expectNoWrites();
        warned.mockRestore();
      });
    }
  });

  it('replays an already-logged txId as a no-op reporting the original allocation', async () => {
    const allocation = { fineGameweeks: [3], buyin: true, creditDeltaPence: 400 };
    safeGetPayments.mockResolvedValue({
      payments: [
        { id: 'tx_replay', entryId: 1, amountPence: 2600, source: 'monzo', receivedAt: 'then', allocation },
      ],
      degraded: false,
    });

    const result = await applyPayment({
      entryId: 1, amountPence: 2600, txId: 'tx_replay', receivedAt: 'now', members,
    });

    expect(result).toEqual({ applied: true, allocation });
    expectNoWrites();
  });

  it('refuses an entry id no balance row will ever show', async () => {
    safeGetBuyins.mockResolvedValue({ buyins: new Set(), degraded: false });
    const result = await applyPayment({
      entryId: 999, amountPence: 2000, txId: 'tx_absent', receivedAt: 'now', members: [],
    });
    expect(result).toEqual({ applied: false, reason: 'unknown member' });
    expectNoWrites();
  });

  it('pays a departed member’s fines but drops the overpayment remainder', async () => {
    const warned = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Entry 99 lost GW3 but is no longer in the member list, so `buildBalances`
    // yields a departed row whose creditPence is masked to 0.
    safeGetResults.mockResolvedValue({ results: new Map([loss(3, 99)]), degraded: false });

    const result = await applyPayment({
      entryId: 99, amountPence: 600, txId: 'tx_departed', receivedAt: 'now', members,
    });

    expect(result).toEqual({
      applied: true,
      allocation: { fineGameweeks: [3], buyin: false, creditDeltaPence: 0 },
    });
    expect(setPaid).toHaveBeenCalledExactlyOnceWith(3, 99, true);
    expect(setCredit).not.toHaveBeenCalled();
    expect(setBuyin).not.toHaveBeenCalled();
    expect(appendPayment).toHaveBeenCalledWith(expect.objectContaining({
      id: 'tx_departed',
      allocation: { fineGameweeks: [3], buyin: false, creditDeltaPence: 0 },
    }));
    expect(warned).toHaveBeenCalled();
    warned.mockRestore();
  });
});
