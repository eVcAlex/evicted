import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@/lib/league/members';

const safeGetBuyins = vi.fn();
const safeGetPaid = vi.fn();
const safeGetResults = vi.fn();
const setPaid = vi.fn();

vi.mock('@/lib/ledger/safe', () => ({ safeGetBuyins, safeGetPaid, safeGetResults }));
vi.mock('@/lib/ledger/store', () => ({
  setPaid,
  paidKey: (gameweek: number, entryId: number) => `${gameweek}:${entryId}`,
}));

const { applyIfOwed } = await import('./apply');

function member(entryId: number, teamName: string): Member {
  return { entryId, managerName: teamName, teamName, joinedTime: null };
}

const members: Member[] = [member(1, 'Team A')];

beforeEach(() => {
  vi.clearAllMocks();
  safeGetPaid.mockResolvedValue({ paid: new Set(), degraded: false });
  safeGetBuyins.mockResolvedValue({ buyins: new Set(), degraded: false });
});

describe('applyIfOwed', () => {
  it('marks the oldest owed gameweeks paid when the credit covers them exactly', async () => {
    safeGetResults.mockResolvedValue({
      results: new Map([
        [3, { losers: [1], scores: { 1: -10 }, recordedAt: '' }],
        [5, { losers: [1], scores: { 1: -10 }, recordedAt: '' }],
      ]),
      degraded: false,
    });
    setPaid.mockResolvedValue(undefined);

    const result = await applyIfOwed({ entryId: 1, amountPence: 200, members });

    expect(result).toEqual({ applied: true, gameweeks: [3] });
    expect(setPaid).toHaveBeenCalledWith(3, 1, true);
    expect(setPaid).toHaveBeenCalledTimes(1);
  });

  it('does not apply anything when nothing is owed', async () => {
    safeGetResults.mockResolvedValue({ results: new Map(), degraded: false });

    const result = await applyIfOwed({ entryId: 1, amountPence: 200, members });

    expect(result).toEqual({ applied: false, gameweeks: [] });
    expect(setPaid).not.toHaveBeenCalled();
  });

  it('does not apply anything when the credit overshoots what is owed', async () => {
    safeGetResults.mockResolvedValue({
      results: new Map([[3, { losers: [1], scores: { 1: -10 }, recordedAt: '' }]]),
      degraded: false,
    });

    const result = await applyIfOwed({ entryId: 1, amountPence: 400, members });

    expect(result).toEqual({ applied: false, gameweeks: [] });
    expect(setPaid).not.toHaveBeenCalled();
  });

  it('still reports applied when setPaid fails, logging rather than throwing', async () => {
    safeGetResults.mockResolvedValue({
      results: new Map([[3, { losers: [1], scores: { 1: -10 }, recordedAt: '' }]]),
      degraded: false,
    });
    setPaid.mockRejectedValue(new Error('store unavailable'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await applyIfOwed({ entryId: 1, amountPence: 200, members });

    expect(result).toEqual({ applied: true, gameweeks: [3] });
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
