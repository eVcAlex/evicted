import { FPL_BASE, FPL_USER_AGENT, LEAGUE_ID } from '@/lib/config';
import type { z } from 'zod';
import {
  bootstrapSchema,
  entryHistorySchema,
  leagueStandingsSchema,
  type Bootstrap,
  type EntryHistory,
  type LeagueStandings,
} from './schemas';

async function fetchAndParse<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  revalidate: number,
): Promise<z.infer<T>> {
  const url = `${FPL_BASE}${path}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': FPL_USER_AGENT },
    next: { revalidate },
  });

  if (!response.ok) {
    throw new Error(`FPL request failed: ${path} returned ${response.status}`);
  }

  return schema.parse(await response.json());
}

/**
 * Not routed through `fetchAndParse`'s `next: { revalidate }` caching: this
 * payload is ~2MB, over Next's per-item fetch-cache limit. Next still
 * attempts the cache write, fails, but had already been serving a stale
 * pre-`data_checked` snapshot from it — `is_current`/`finished`/
 * `data_checked` all live here, so a stale read here is a wrong "provisional"
 * banner, not just a slow page. FPL's own CDN already caches this response
 * for 5 minutes, so skipping our cache doesn't mean hitting their origin on
 * every request.
 */
export async function fetchBootstrap(): Promise<Bootstrap> {
  const response = await fetch(`${FPL_BASE}/bootstrap-static/`, {
    headers: { 'User-Agent': FPL_USER_AGENT },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`FPL request failed: /bootstrap-static/ returned ${response.status}`);
  }

  return bootstrapSchema.parse(await response.json());
}

export function fetchStandings(revalidate: number): Promise<LeagueStandings> {
  return fetchAndParse(
    `/leagues-classic/${LEAGUE_ID}/standings/`,
    leagueStandingsSchema,
    revalidate,
  );
}

export function fetchHistory(entryId: number, revalidate: number): Promise<EntryHistory> {
  return fetchAndParse(`/entry/${entryId}/history/`, entryHistorySchema, revalidate);
}
