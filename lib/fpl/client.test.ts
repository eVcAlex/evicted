import { afterEach, describe, expect, it, vi } from 'vitest';
import { LEAGUE_ID } from '@/lib/config';
import { fetchBootstrap, fetchHistory, fetchStandings } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(body: unknown, ok = true) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 503,
    json: async () => body,
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('fetchBootstrap', () => {
  it('sends a browser User-Agent', async () => {
    const spy = stubFetch({ events: [] });
    await fetchBootstrap();
    const [, init] = spy.mock.calls[0];
    expect(init.headers['User-Agent']).toContain('Mozilla/5.0');
  });

  // The payload is ~2MB, over Next's per-item fetch-cache limit. Asking Next
  // to cache it anyway doesn't just fail to cache — the failed write left a
  // stale, pre-`data_checked` snapshot being served on later requests, so
  // this fetch opts out of the cache entirely rather than risk that again.
  it('opts out of the Next.js fetch cache', async () => {
    const spy = stubFetch({ events: [] });
    await fetchBootstrap();
    const [, init] = spy.mock.calls[0];
    expect(init.cache).toBe('no-store');
  });

  it('throws when the response is not ok', async () => {
    stubFetch({}, false);
    await expect(fetchBootstrap()).rejects.toThrow('FPL request failed');
  });

  it('throws when the payload does not match the schema', async () => {
    stubFetch({ events: [{ id: 'not-a-number' }] });
    await expect(fetchBootstrap()).rejects.toThrow();
  });
});

describe('fetchHistory', () => {
  it('requests the entry history path', async () => {
    const spy = stubFetch({ current: [] });
    await fetchHistory(394534, 60);
    const [url] = spy.mock.calls[0];
    expect(url).toBe('https://fantasy.premierleague.com/api/entry/394534/history/');
  });
});

describe('fetchStandings', () => {
  it('requests the league standings path built from LEAGUE_ID', async () => {
    const spy = stubFetch({
      league: { id: LEAGUE_ID, name: 'Evicted', start_event: 1 },
      standings: { results: [] },
      new_entries: { results: [] },
    });
    await fetchStandings(60);
    const [url] = spy.mock.calls[0];
    expect(url).toBe(`https://fantasy.premierleague.com/api/leagues-classic/${LEAGUE_ID}/standings/`);
  });
});
