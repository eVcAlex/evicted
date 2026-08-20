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

export function fetchBootstrap(revalidate: number): Promise<Bootstrap> {
  return fetchAndParse('/bootstrap-static/', bootstrapSchema, revalidate);
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
