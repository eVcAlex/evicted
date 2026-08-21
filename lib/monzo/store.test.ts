import { beforeEach, describe, expect, it, vi } from 'vitest';

const sadd = vi.fn();
const lpush = vi.fn();
const ltrim = vi.fn();
const lrange = vi.fn();
const del = vi.fn();
const rpush = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: class {
    sadd = sadd;
    lpush = lpush;
    ltrim = ltrim;
    lrange = lrange;
    del = del;
    rpush = rpush;
  },
}));

vi.stubEnv('UPSTASH_REDIS_REST_URL', 'https://mock.upstash.invalid');
vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', 'mock-token');

const { appendPending, dismissPending, getPending, markTransactionSeen } = await import('./store');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('markTransactionSeen', () => {
  it('returns true the first time a transaction id is seen', async () => {
    sadd.mockResolvedValue(1);
    expect(await markTransactionSeen('tx_1')).toBe(true);
    expect(sadd).toHaveBeenCalledWith('evicted:monzo:seen', 'tx_1');
  });

  it('returns false on a redelivery of the same transaction', async () => {
    sadd.mockResolvedValue(0);
    expect(await markTransactionSeen('tx_1')).toBe(false);
  });
});

describe('appendPending / getPending', () => {
  it('pushes an entry and trims to the bound', async () => {
    const entry = {
      id: 'tx_1',
      receivedAt: '2026-08-21T12:00:00Z',
      amountPence: 200,
      counterpartyName: 'A Random Friend',
      reason: 'ambiguous' as const,
      candidates: ['Team A', 'Team B'],
    };
    await appendPending(entry);
    expect(lpush).toHaveBeenCalledWith('evicted:monzo:pending', entry);
    expect(ltrim).toHaveBeenCalledWith('evicted:monzo:pending', 0, 49);
  });

  it('reads back the pending list', async () => {
    lrange.mockResolvedValue([]);
    expect(await getPending()).toEqual([]);
    expect(lrange).toHaveBeenCalledWith('evicted:monzo:pending', 0, 49);
  });
});

describe('dismissPending', () => {
  it('removes only the matching entry and rewrites the rest', async () => {
    lrange.mockResolvedValue([
      { id: 'tx_1', receivedAt: '', amountPence: 200, counterpartyName: 'A', reason: 'ambiguous', candidates: [] },
      { id: 'tx_2', receivedAt: '', amountPence: 200, counterpartyName: 'B', reason: 'no-debt', candidates: [] },
    ]);

    await dismissPending('tx_1');

    expect(del).toHaveBeenCalledWith('evicted:monzo:pending');
    expect(rpush).toHaveBeenCalledWith(
      'evicted:monzo:pending',
      expect.objectContaining({ id: 'tx_2' }),
    );
  });

  it('does not re-push anything when the list is left empty', async () => {
    lrange.mockResolvedValue([
      { id: 'tx_1', receivedAt: '', amountPence: 200, counterpartyName: 'A', reason: 'ambiguous', candidates: [] },
    ]);

    await dismissPending('tx_1');

    expect(del).toHaveBeenCalledWith('evicted:monzo:pending');
    expect(rpush).not.toHaveBeenCalled();
  });
});
