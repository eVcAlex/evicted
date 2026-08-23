import { afterEach, describe, expect, it, vi } from 'vitest';
import { DRAFT_LEAGUE_ID } from '@/lib/config';
import {
  fetchDraftBootstrap,
  fetchDraftEntryHistory,
  fetchDraftGame,
  fetchDraftLeague,
} from './client';

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

describe('fetchDraftGame', () => {
  it('requests /game with a browser User-Agent', async () => {
    const spy = stubFetch({ current_event: 1, current_event_finished: false, next_event: 2 });
    await fetchDraftGame(60);
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe('https://draft.premierleague.com/api/game');
    expect(init.headers['User-Agent']).toContain('Mozilla/5.0');
  });

  it('throws when the response is not ok', async () => {
    stubFetch({}, false);
    await expect(fetchDraftGame(60)).rejects.toThrow('Draft request failed');
  });
});

describe('fetchDraftBootstrap', () => {
  it('passes the revalidate window to Next', async () => {
    const spy = stubFetch({ events: { current: 1, next: 2, data: [] } });
    await fetchDraftBootstrap(3600);
    const [, init] = spy.mock.calls[0];
    expect(init.next).toEqual({ revalidate: 3600 });
  });

  it('throws when the payload does not match the schema', async () => {
    stubFetch({ events: { current: 'not-a-number', next: null, data: [] } });
    await expect(fetchDraftBootstrap(60)).rejects.toThrow();
  });
});

describe('fetchDraftLeague', () => {
  it('requests the league details path built from DRAFT_LEAGUE_ID', async () => {
    const spy = stubFetch({
      league: {
        id: DRAFT_LEAGUE_ID,
        name: 'Draft league',
        draft_status: 'post',
        draft_dt: null,
        closed: true,
        scoring: 'h',
        start_event: 1,
        stop_event: 38,
      },
      league_entries: [],
      standings: [],
    });
    await fetchDraftLeague(60);
    const [url] = spy.mock.calls[0];
    expect(url).toBe(`https://draft.premierleague.com/api/league/${DRAFT_LEAGUE_ID}/details`);
  });
});

describe('fetchDraftEntryHistory', () => {
  it('requests the entry history path with no trailing slash', async () => {
    const spy = stubFetch({ history: [] });
    await fetchDraftEntryHistory(17456, 60);
    const [url] = spy.mock.calls[0];
    expect(url).toBe('https://draft.premierleague.com/api/entry/17456/history');
  });
});
