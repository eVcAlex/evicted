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
    await fetchBootstrap(60);
    const [, init] = spy.mock.calls[0];
    expect(init.headers['User-Agent']).toContain('Mozilla/5.0');
  });

  it('passes the revalidate window to Next', async () => {
    const spy = stubFetch({ events: [] });
    await fetchBootstrap(3600);
    const [, init] = spy.mock.calls[0];
    expect(init.next).toEqual({ revalidate: 3600 });
  });

  it('throws when the response is not ok', async () => {
    stubFetch({}, false);
    await expect(fetchBootstrap(60)).rejects.toThrow('FPL request failed');
  });

  it('throws when the payload does not match the schema', async () => {
    stubFetch({ events: [{ id: 'not-a-number' }] });
    await expect(fetchBootstrap(60)).rejects.toThrow();
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
