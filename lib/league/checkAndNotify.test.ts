import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bootstrap } from '@/lib/fpl/schemas';
import type { Member } from './members';

const safeRecordSettledGameweeks = vi.fn();
const reconcileCredit = vi.fn();
const notifyLosers = vi.fn();
const fetchHistory = vi.fn();

/** Captures `after` callbacks so a test can assert *when* they run, not just that they do. */
const scheduled: Array<() => unknown> = [];
vi.mock('next/server', () => ({
  after: (fn: () => unknown) => {
    scheduled.push(fn);
  },
}));
vi.mock('@/lib/ledger/safe', () => ({ safeRecordSettledGameweeks }));
vi.mock('@/lib/ledger/credit', () => ({ reconcileCredit }));
vi.mock('@/lib/push/send', () => ({ notifyLosers }));
vi.mock('@/lib/fpl/client', () => ({ fetchHistory }));

const { checkAndNotifySettled } = await import('./checkAndNotify');

const members: Member[] = [{ entryId: 1, managerName: 'A', teamName: 'Team A', joinedTime: null }];
const bootstrap = { events: [], elements: [] } as unknown as Bootstrap;

/** Returns the render-path result, then drains the work `after()` deferred. */
async function run() {
  const result = await checkAndNotifySettled({ bootstrap, members, eligibleFrom: new Map() });
  await Promise.all(scheduled.map((fn) => fn()));
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  scheduled.length = 0;
  safeRecordSettledGameweeks.mockResolvedValue({
    results: new Map(), newlyRecorded: [], degraded: false,
  });
  reconcileCredit.mockResolvedValue(undefined);
  notifyLosers.mockResolvedValue(undefined);
});

describe('checkAndNotifySettled', () => {
  it('chases credit even when no gameweek was newly recorded', async () => {
    // The tick that recorded the fine may have run while a store was degraded,
    // where reconcileCredit correctly bails. Every later tick has an empty
    // newlyRecorded, so gating on it left the invariant broken for a week.
    await run();
    expect(reconcileCredit).toHaveBeenCalledExactlyOnceWith(members);
  });

  it('chases credit after recording a gameweek too', async () => {
    safeRecordSettledGameweeks.mockResolvedValue({
      results: new Map(), newlyRecorded: [{ gameweek: 3, losers: members }], degraded: false,
    });
    await run();
    expect(reconcileCredit).toHaveBeenCalledExactlyOnceWith(members);
  });

  it('logs rather than throwing when the credit chase fails', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    reconcileCredit.mockRejectedValue(new Error('store down'));

    await expect(run()).resolves.toEqual({ results: new Map(), degraded: false });

    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });

  it('defers the credit chase off the render path', async () => {
    // Four Redis reads plus writes; nobody's page load should wait on them.
    await checkAndNotifySettled({ bootstrap, members, eligibleFrom: new Map() });
    expect(reconcileCredit).not.toHaveBeenCalled();

    await Promise.all(scheduled.map((fn) => fn()));
    expect(reconcileCredit).toHaveBeenCalledExactlyOnceWith(members);
  });

  it('still notifies losers', async () => {
    const newlyRecorded = [{ gameweek: 3, losers: members }];
    safeRecordSettledGameweeks.mockResolvedValue({ results: new Map(), newlyRecorded, degraded: false });
    await run();
    expect(notifyLosers).toHaveBeenCalledWith(newlyRecorded);
  });
});
