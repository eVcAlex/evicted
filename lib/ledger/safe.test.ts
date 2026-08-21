import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPaid = vi.fn();
const getResults = vi.fn();
const recordSettledGameweeks = vi.fn();

vi.mock('./store', () => ({ getPaid, getResults }));
vi.mock('@/lib/league/record', () => ({ recordSettledGameweeks }));

const { safeGetPaid, safeGetResults, safeRecordSettledGameweeks } = await import('./safe');

const recordParams = {
  bootstrap: { events: [] },
  members: [],
  eligibleFrom: new Map<number, number>(),
  fetchHistories: () => Promise.resolve(new Map()),
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('safeGetPaid', () => {
  it('passes the set through when Redis answers', async () => {
    getPaid.mockResolvedValue(new Set(['1:394534']));
    const { paid, degraded } = await safeGetPaid();
    expect(paid.has('1:394534')).toBe(true);
    expect(degraded).toBe(false);
  });

  it('returns an empty set and flags degradation when Redis throws', async () => {
    getPaid.mockRejectedValue(new Error('connection refused'));
    const { paid, degraded } = await safeGetPaid();
    expect(paid.size).toBe(0);
    expect(degraded).toBe(true);
  });
});

describe('safeGetResults', () => {
  it('passes the map through when Redis answers', async () => {
    const result = { losers: [394534], scores: { 394534: -12 }, recordedAt: '2026-08-20T00:00:00.000Z' };
    getResults.mockResolvedValue(new Map([[1, result]]));
    const { results, degraded } = await safeGetResults();
    expect(results.get(1)).toEqual(result);
    expect(degraded).toBe(false);
  });

  it('returns an empty map and flags degradation when Redis throws', async () => {
    getResults.mockRejectedValue(new Error('connection refused'));
    const { results, degraded } = await safeGetResults();
    expect(results.size).toBe(0);
    expect(degraded).toBe(true);
  });
});

describe('safeRecordSettledGameweeks', () => {
  it('passes the recorded map and newly-recorded list through when the store answers', async () => {
    const result = { losers: [1], scores: { 1: 30 }, recordedAt: '2026-08-24T00:00:00.000Z' };
    const newlyRecorded = [
      {
        summary: { gameweek: 1, provisional: false, losers: [], allTied: false, runnerUpNet: null },
        previousLosses: new Map(),
      },
    ];
    recordSettledGameweeks.mockResolvedValue({ results: new Map([[1, result]]), newlyRecorded });

    const { results, newlyRecorded: got, degraded } = await safeRecordSettledGameweeks(recordParams);

    expect(results.get(1)).toEqual(result);
    expect(got).toBe(newlyRecorded);
    expect(degraded).toBe(false);
  });

  // Without this the home page 500s the moment `is_current` flips with no
  // Upstash credentials configured, and blames the FPL API for it.
  it('degrades instead of throwing when the store is unreachable', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    recordSettledGameweeks.mockRejectedValue(new Error('no credentials'));

    const { results, newlyRecorded, degraded } = await safeRecordSettledGameweeks(recordParams);

    expect(results.size).toBe(0);
    expect(newlyRecorded).toEqual([]);
    expect(degraded).toBe(true);
    expect(logged).toHaveBeenCalledOnce();
    logged.mockRestore();
  });
});
