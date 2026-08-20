import { describe, expect, it, vi } from 'vitest';

/**
 * The unconfigured store must fail *immediately*.
 *
 * The Upstash client does not fail fast when built without a URL: it retries
 * the unparseable request on the SDK's default backoff and takes roughly 4.3
 * seconds to give up. Every page load paid that in full before rendering,
 * because the render awaits the store before it can decide whether to show the
 * degraded notice. This asserts the throw happens without a round trip.
 */
vi.mock('@upstash/redis', () => ({
  Redis: class {
    constructor() {
      throw new Error('client must not be constructed without credentials');
    }
  },
}));

vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
vi.stubEnv('KV_REST_API_URL', '');
vi.stubEnv('KV_REST_API_TOKEN', '');

const { getPaid, getResults } = await import('./store');
const { safeGetPaid, safeGetResults } = await import('./safe');

describe('an unconfigured store', () => {
  it('throws rather than constructing a client that cannot work', async () => {
    await expect(getPaid()).rejects.toThrow(/not configured/);
    await expect(getResults()).rejects.toThrow(/not configured/);
  });

  it('degrades to unknown, never to settled', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const paid = await safeGetPaid();
    expect(paid.degraded).toBe(true);
    expect(paid.paid.size).toBe(0);

    const results = await safeGetResults();
    expect(results.degraded).toBe(true);
    expect(results.results.size).toBe(0);
  });

  it('degrades fast enough to render, not on a multi-second retry budget', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const started = performance.now();
    await safeGetPaid();
    expect(performance.now() - started).toBeLessThan(100);
  });
});
