import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPaid = vi.fn();
const getResults = vi.fn();

vi.mock('./store', () => ({ getPaid, getResults }));

const { safeGetPaid, safeGetResults } = await import('./safe');

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
  it('returns an empty map and flags degradation when Redis throws', async () => {
    getResults.mockRejectedValue(new Error('connection refused'));
    const { results, degraded } = await safeGetResults();
    expect(results.size).toBe(0);
    expect(degraded).toBe(true);
  });
});
