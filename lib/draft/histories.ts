import { fetchDraftEntryHistory } from './client';
import type { DraftMember } from './members';
import type { DraftEntryHistory } from './schemas';

/**
 * One history fetch per member, keyed by `entryId` (the stable league-entry
 * id `DraftScore`/`buildSeasonResults` expect), even though the actual
 * request URL is built from `teamId`. A member with no `teamId` (an
 * unclaimed league slot) is skipped rather than requested — there is no
 * `/entry/null/history` to fetch.
 *
 * `Promise.all`, not `allSettled`: a partial fetch would silently change who
 * is bottom this week. Better to fail the whole page loudly than render a
 * confidently wrong answer.
 */
export async function loadDraftHistories(
  members: DraftMember[],
  revalidate: number,
): Promise<Map<number, DraftEntryHistory>> {
  const claimed = members.filter(
    (member): member is DraftMember & { teamId: number } => member.teamId !== null,
  );

  return new Map(
    await Promise.all(
      claimed.map(
        async (member) =>
          [member.entryId, await fetchDraftEntryHistory(member.teamId, revalidate)] as const,
      ),
    ),
  );
}
