import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@/lib/league/members';

const safeGetBuyins = vi.fn();
const safeGetPaid = vi.fn();
const safeGetResults = vi.fn();
const safeGetCredit = vi.fn();
const setPaid = vi.fn();
const setCredit = vi.fn();
const appendPayment = vi.fn();

vi.mock('@/lib/ledger/safe', () => ({ safeGetBuyins, safeGetPaid, safeGetResults, safeGetCredit }));
vi.mock('./store', () => ({ setPaid, setCredit, appendPayment, paidKey: (g: number, e: number) => `${g}:${e}` }));

const { reconcileCredit } = await import('./credit');

function member(entryId: number): Member {
  return { entryId, managerName: `M${entryId}`, teamName: `T${entryId}`, joinedTime: null };
}
const members = [member(1), member(2)];

function loss(gw: number, who: number) {
  return [gw, { losers: [who], scores: { [who]: -5 }, recordedAt: '' }] as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  setPaid.mockReset();
  setCredit.mockReset();
  appendPayment.mockReset();
  safeGetPaid.mockResolvedValue({ paid: new Set(), degraded: false });
  safeGetBuyins.mockResolvedValue({ buyins: new Set([1, 2]), degraded: false });
  safeGetResults.mockResolvedValue({ results: new Map(), degraded: false });
  safeGetCredit.mockResolvedValue({ credit: new Map(), degraded: false });
});

describe('reconcileCredit', () => {
  it('pays a member’s unpaid fine from their banked credit, oldest first', async () => {
    safeGetResults.mockResolvedValue({ results: new Map([loss(3, 1), loss(4, 1)]), degraded: false });
    safeGetCredit.mockResolvedValue({ credit: new Map([[1, 200]]), degraded: false });

    await reconcileCredit(members);

    expect(setPaid).toHaveBeenCalledExactlyOnceWith(3, 1, true);
    expect(setCredit).toHaveBeenCalledWith(1, 0);
    expect(appendPayment).toHaveBeenCalledWith(expect.objectContaining({
      source: 'credit-chase', entryId: 1, amountPence: 0,
      allocation: { fineGameweeks: [3], buyin: false, creditDeltaPence: -200 },
    }));
  });

  it('clears several fines in one chase entry when credit covers them', async () => {
    safeGetResults.mockResolvedValue({ results: new Map([loss(3, 1), loss(4, 1)]), degraded: false });
    safeGetCredit.mockResolvedValue({ credit: new Map([[1, 400]]), degraded: false });

    await reconcileCredit(members);

    expect(setPaid).toHaveBeenCalledTimes(2);
    expect(appendPayment).toHaveBeenCalledWith(expect.objectContaining({
      allocation: { fineGameweeks: [3, 4], buyin: false, creditDeltaPence: -400 },
    }));
  });

  it('does nothing when a member has credit but no unpaid fines', async () => {
    safeGetCredit.mockResolvedValue({ credit: new Map([[1, 600]]), degraded: false });
    await reconcileCredit(members);
    expect(setPaid).not.toHaveBeenCalled();
    expect(appendPayment).not.toHaveBeenCalled();
  });

  it('does nothing when a member has unpaid fines but no credit', async () => {
    safeGetResults.mockResolvedValue({ results: new Map([loss(3, 1)]), degraded: false });
    await reconcileCredit(members);
    expect(setPaid).not.toHaveBeenCalled();
  });

  it('does nothing when any ledger store is degraded', async () => {
    safeGetResults.mockResolvedValue({ results: new Map([loss(3, 1)]), degraded: true });
    safeGetCredit.mockResolvedValue({ credit: new Map([[1, 600]]), degraded: false });

    await reconcileCredit(members);

    expect(setPaid).not.toHaveBeenCalled();
    expect(setCredit).not.toHaveBeenCalled();
    expect(appendPayment).not.toHaveBeenCalled();
  });

  it('logs and carries on when one member’s write fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    safeGetResults.mockResolvedValue({
      results: new Map([loss(3, 1), loss(4, 2)]),
      degraded: false,
    });
    safeGetCredit.mockResolvedValue({ credit: new Map([[1, 200], [2, 200]]), degraded: false });
    setPaid.mockImplementation((_gw: number, entryId: number) =>
      entryId === 1 ? Promise.reject(new Error('boom')) : Promise.resolve(),
    );

    await reconcileCredit(members);

    expect(setCredit).toHaveBeenCalledExactlyOnceWith(2, 0);
    expect(appendPayment).toHaveBeenCalledTimes(1);
    expect(appendPayment).toHaveBeenCalledWith(
      expect.objectContaining({ entryId: 2, source: 'credit-chase' }),
    );
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('skips a departed member holding credit with an unpaid fine', async () => {
    safeGetResults.mockResolvedValue({ results: new Map([loss(3, 99)]), degraded: false });
    safeGetCredit.mockResolvedValue({ credit: new Map([[99, 600]]), degraded: false });

    await reconcileCredit(members);

    expect(setPaid).not.toHaveBeenCalled();
    expect(setCredit).not.toHaveBeenCalled();
    expect(appendPayment).not.toHaveBeenCalled();
  });

  it('never touches the buy-in', async () => {
    safeGetBuyins.mockResolvedValue({ buyins: new Set(), degraded: false });
    safeGetResults.mockResolvedValue({ results: new Map([loss(3, 1)]), degraded: false });
    safeGetCredit.mockResolvedValue({ credit: new Map([[1, 5000]]), degraded: false });

    await reconcileCredit(members);

    // Only the one fine is paid; the £48 left is NOT spent on the buy-in here.
    expect(setCredit).toHaveBeenCalledWith(1, 4800);
    expect(appendPayment).toHaveBeenCalledWith(expect.objectContaining({
      allocation: expect.objectContaining({ buyin: false }),
    }));
  });
});
