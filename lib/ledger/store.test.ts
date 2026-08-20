import { beforeEach, describe, expect, it, vi } from 'vitest';

const hgetall = vi.fn();
const hset = vi.fn();
const smembers = vi.fn();
const sadd = vi.fn();
const srem = vi.fn();

// `store.ts` calls the static `Redis.fromEnv()`, so the mock must expose that
// static — a class with instance members alone would throw.
vi.mock('@upstash/redis', () => ({
  Redis: {
    fromEnv: () => ({ hgetall, hset, smembers, sadd, srem }),
  },
}));

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
  it('writes under the gameweek field', async () => {
    const result = { losers: [1], scores: { 1: 30 }, recordedAt: '2026-09-01T00:00:00Z' };
    await saveResult(5, result);
    expect(hset).toHaveBeenCalledWith('evicted:results', { '5': result });
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
