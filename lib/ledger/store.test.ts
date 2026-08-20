import { beforeEach, describe, expect, it, vi } from 'vitest';

const hgetall = vi.fn();
const hsetnx = vi.fn();
const smembers = vi.fn();
const sadd = vi.fn();
const srem = vi.fn();

// `store.ts` constructs `new Redis({ url, token, retry })`, so the mock must be
// a constructible class — an object with instance members alone would throw.
vi.mock('@upstash/redis', () => ({
  Redis: class {
    hgetall = hgetall;
    hsetnx = hsetnx;
    smembers = smembers;
    sadd = sadd;
    srem = srem;
  },
}));

// `store.ts` refuses to build a client without credentials, so that an
// unconfigured deployment degrades instantly instead of spending seconds
// retrying a request that cannot succeed. These are the values the mock
// ignores; only their presence matters.
vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://mock.upstash.invalid');
vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'mock-token');

const { getPaid, getResults, paidKey, saveResult, setPaid } = await import('./store');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('paidKey', () => {
  it('joins gameweek and entry id', () => {
    expect(paidKey(5, 394534)).toBe('5:394534');
  });
});

describe('getResults', () => {
  it('returns an empty map when nothing is recorded', async () => {
    hgetall.mockResolvedValue(null);
    expect(await getResults()).toEqual(new Map());
  });

  it('keys results by gameweek number', async () => {
    hgetall.mockResolvedValue({
      '5': { losers: [1], scores: { 1: 30 }, recordedAt: '2026-09-01T00:00:00Z' },
    });
    const results = await getResults();
    expect(results.get(5)?.losers).toEqual([1]);
  });
});

describe('saveResult', () => {
  it('writes under the gameweek field when none exists yet', async () => {
    hsetnx.mockResolvedValue(1);
    const result = { losers: [1], scores: { 1: 30 }, recordedAt: '2026-09-01T00:00:00Z' };
    expect(await saveResult(5, result)).toBe(true);
    expect(hsetnx).toHaveBeenCalledWith('evicted:results', '5', result);
  });

  it('leaves an existing gameweek untouched', async () => {
    hsetnx.mockResolvedValue(0);
    const result = { losers: [1], scores: { 1: 30 }, recordedAt: '2026-09-01T00:00:00Z' };
    expect(await saveResult(5, result)).toBe(false);
  });
});

describe('getPaid', () => {
  it('returns a set of composite keys', async () => {
    smembers.mockResolvedValue(['5:394534', '6:567357']);
    const paid = await getPaid();
    expect(paid.has('5:394534')).toBe(true);
    expect(paid.has('7:1')).toBe(false);
  });

  it('returns an empty set when nothing is paid', async () => {
    smembers.mockResolvedValue([]);
    expect(await getPaid()).toEqual(new Set());
  });
});

describe('setPaid', () => {
  it('adds the key when marking paid', async () => {
    await setPaid(5, 394534, true);
    expect(sadd).toHaveBeenCalledWith('evicted:paid', '5:394534');
  });

  it('removes the key when marking unpaid', async () => {
    await setPaid(5, 394534, false);
    expect(srem).toHaveBeenCalledWith('evicted:paid', '5:394534');
  });
});
