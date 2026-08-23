import { DRAFT_BASE, DRAFT_LEAGUE_ID, FPL_USER_AGENT } from '@/lib/config';
import type { z } from 'zod';
import {
  draftBootstrapSchema,
  draftEntryHistorySchema,
  draftGameSchema,
  draftLeagueDetailsSchema,
  type DraftBootstrap,
  type DraftEntryHistory,
  type DraftGame,
  type DraftLeagueDetails,
} from './schemas';

async function fetchAndParse<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  revalidate: number,
): Promise<z.infer<T>> {
  const url = `${DRAFT_BASE}${path}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': FPL_USER_AGENT },
    next: { revalidate },
  });

  if (!response.ok) {
    throw new Error(`Draft request failed: ${path} returned ${response.status}`);
  }

  return schema.parse(await response.json());
}

/** A cheap poll — check this before fetching the ~1MB bootstrap. */
export function fetchDraftGame(revalidate: number): Promise<DraftGame> {
  return fetchAndParse('/game', draftGameSchema, revalidate);
}

export function fetchDraftBootstrap(revalidate: number): Promise<DraftBootstrap> {
  return fetchAndParse('/bootstrap-static', draftBootstrapSchema, revalidate);
}

export function fetchDraftLeague(revalidate: number): Promise<DraftLeagueDetails> {
  return fetchAndParse(`/league/${DRAFT_LEAGUE_ID}/details`, draftLeagueDetailsSchema, revalidate);
}

export function fetchDraftEntryHistory(
  entryId: number,
  revalidate: number,
): Promise<DraftEntryHistory> {
  return fetchAndParse(`/entry/${entryId}/history`, draftEntryHistorySchema, revalidate);
}
