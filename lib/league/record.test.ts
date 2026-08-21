import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Bootstrap, EntryHistory, GameweekEvent } from '@/lib/fpl/schemas';
import type { GameweekResult } from '@/lib/ledger/store';
import type { Member } from './members';

const getResults = vi.fn();
const saveResult = vi.fn();

vi.mock('@/lib/ledger/store', () => ({
  getResults,
  saveResult,
  paidKey: (gameweek: number, entryId: number) => `${gameweek}:${entryId}`,
}));

const { recordSettledGameweeks } = await import('./record');

function event(id: number, overrides: Partial<GameweekEvent> = {}): GameweekEvent {
  return {
    id,
    name: `Gameweek ${id}`,
    deadline_time: '2026-08-21T17:30:00Z',
    finished: false,
    data_checked: false,
    is_current: false,
    is_next: false,
    is_previous: false,
    ...overrides,
  };
}

function settled(...ids: number[]): Bootstrap {
  return { events: ids.map((id) => event(id, { finished: true, data_checked: true })) };
}

function history(points: Array<[gameweek: number, points: number]>): EntryHistory {
  return {
    current: points.map(([event_, value]) => ({
      event: event_,
      points: value,
      event_transfers_cost: 0,
      total_points: value,
      points_on_bench: 0,
    })),
  };
}

function member(entryId: number): Member {
  return {
    entryId,
    managerName: `Manager ${entryId}`,
    teamName: `Team ${entryId}`,
    joinedTime: null,
  };
}

const members = [member(1), member(2), member(3)];
const eligibleFrom = new Map([
  [1, 1],
  [2, 1],
  [3, 1],
]);

function histories(map: Record<number, EntryHistory>) {
  return () => Promise.resolve(new Map(Object.entries(map).map(([id, h]) => [Number(id), h])));
}

/** Everyone scored in gameweeks 1 and 2; entry 2 is bottom both times. */
const complete = histories({
  1: history([
    [1, 50],
    [2, 50],
  ]),
  2: history([
    [1, 20],
    [2, 21],
  ]),
  3: history([
    [1, 40],
    [2, 40],
  ]),
});

beforeEach(() => {
  vi.clearAllMocks();
  getResults.mockResolvedValue(new Map());
  saveResult.mockResolvedValue(true);
});

describe('recordSettledGameweeks', () => {
  it('records a settled gameweek from complete data', async () => {
    const { results } = await recordSettledGameweeks({
      bootstrap: settled(1),
      members,
      eligibleFrom,
      fetchHistories: complete,
    });

    expect(saveResult).toHaveBeenCalledTimes(1);
    expect(saveResult.mock.calls[0][0]).toBe(1);
    expect(saveResult.mock.calls[0][1].losers).toEqual([2]);
    expect(results.get(1)?.scores).toEqual({ 1: 50, 2: 20, 3: 40 });
  });

  it('reports the newly-recorded gameweek with a full summary and quip-ready data', async () => {
    const { newlyRecorded } = await recordSettledGameweeks({
      bootstrap: settled(1),
      members,
      eligibleFrom,
      fetchHistories: complete,
    });

    expect(newlyRecorded).toHaveLength(1);
    const [entry] = newlyRecorded;
    expect(entry.summary.gameweek).toBe(1);
    expect(entry.summary.losers).toHaveLength(1);
    expect(entry.summary.losers[0].member.entryId).toBe(2);
    // Entry 2's gross/hits/bench survive here even though `GameweekResult`
    // (what's actually persisted) only keeps net.
    expect(entry.summary.losers[0].score.gross).toBe(20);
    expect(entry.previousLosses.size).toBe(0);
  });

  it('gives each gameweek in a multi-week catch-up its own previousLosses snapshot', async () => {
    // Entry 2 is bottom in both gameweeks 1 and 2 (see `complete`), so its
    // gameweek-2 notification should see gameweek 1 as a prior loss, while
    // gameweek 1's own notification sees none yet.
    const { newlyRecorded } = await recordSettledGameweeks({
      bootstrap: settled(1, 2),
      members,
      eligibleFrom,
      fetchHistories: complete,
    });

    expect(newlyRecorded).toHaveLength(2);
    expect(newlyRecorded[0].previousLosses.get(2)).toBeUndefined();
    expect(newlyRecorded[1].previousLosses.get(2)).toEqual([1]);
  });

  it('refuses to record a gameweek a member has no score for', async () => {
    const logged = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Entry 3's `fetchHistory` failed and came back empty. Recording anyway
    // would fine entry 2 for a gameweek entry 3 might have lost.
    await recordSettledGameweeks({
      bootstrap: settled(1),
      members,
      eligibleFrom,
      fetchHistories: histories({
        1: history([[1, 50]]),
        2: history([[1, 20]]),
        3: history([]),
      }),
    });

    expect(saveResult).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledOnce();
  });

  it('refuses when a member is missing from the histories entirely', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await recordSettledGameweeks({
      bootstrap: settled(1),
      members,
      eligibleFrom,
      fetchHistories: histories({
        1: history([[1, 50]]),
        2: history([[1, 20]]),
      }),
    });

    expect(saveResult).not.toHaveBeenCalled();
  });

  it('does not require a score from someone who had not joined yet', async () => {
    await recordSettledGameweeks({
      bootstrap: settled(1),
      members,
      eligibleFrom: new Map([
        [1, 1],
        [2, 1],
        [3, 10],
      ]),
      fetchHistories: histories({
        1: history([[1, 50]]),
        2: history([[1, 20]]),
        3: history([[1, 5]]),
      }),
    });

    // Entry 3 is not liable for gameweek 1 and is not scored for it, even
    // though their FPL history covers it.
    expect(saveResult).toHaveBeenCalledTimes(1);
    expect(saveResult.mock.calls[0][1].losers).toEqual([2]);
    expect(saveResult.mock.calls[0][1].scores).toEqual({ 1: 50, 2: 20 });
  });

  it('never records a finished gameweek that is not data_checked', async () => {
    const fetchHistories = vi.fn(complete);

    await recordSettledGameweeks({
      bootstrap: { events: [event(1, { finished: true, data_checked: false })] },
      members,
      eligibleFrom,
      fetchHistories,
    });

    expect(saveResult).not.toHaveBeenCalled();
    expect(fetchHistories).not.toHaveBeenCalled();
  });

  it('leaves an already-recorded gameweek alone', async () => {
    const existing: GameweekResult = {
      losers: [1],
      scores: { 1: 10 },
      recordedAt: '2026-08-24T00:00:00.000Z',
    };
    getResults.mockResolvedValue(new Map([[1, existing]]));
    const fetchHistories = vi.fn(complete);

    const { results, newlyRecorded } = await recordSettledGameweeks({
      bootstrap: settled(1),
      members,
      eligibleFrom,
      fetchHistories,
    });

    expect(saveResult).not.toHaveBeenCalled();
    expect(fetchHistories).not.toHaveBeenCalled();
    expect(results.get(1)).toBe(existing);
    expect(newlyRecorded).toEqual([]);
  });

  it('fills a multi-week gap oldest first', async () => {
    await recordSettledGameweeks({
      bootstrap: settled(2, 1),
      members,
      eligibleFrom,
      fetchHistories: complete,
    });

    expect(saveResult.mock.calls.map((call) => call[0])).toEqual([1, 2]);
  });

  it('only reflects a result locally once the store has accepted it', async () => {
    saveResult.mockResolvedValue(false);

    const { results, newlyRecorded } = await recordSettledGameweeks({
      bootstrap: settled(1),
      members,
      eligibleFrom,
      fetchHistories: complete,
    });

    expect(saveResult).toHaveBeenCalledTimes(1);
    expect(results.has(1)).toBe(false);
    expect(newlyRecorded).toEqual([]);
  });

  it('propagates a store failure rather than recording from nothing', async () => {
    getResults.mockRejectedValue(new Error('no credentials'));

    await expect(
      recordSettledGameweeks({
        bootstrap: settled(1),
        members,
        eligibleFrom,
        fetchHistories: complete,
      }),
    ).rejects.toThrow('no credentials');
  });
});
