import { fetchDraftGame, fetchDraftLeague } from '@/lib/draft/client';
import { REVALIDATE_LIVE, revalidateForGame } from '@/lib/draft/gameweeks';
import { resolveDraftMembers } from '@/lib/draft/members';
import { buildStandingsRows } from '@/lib/draft/standings';
import { isDraftLive } from '@/lib/draft/status';
import { DraftStandingsTable } from '../components/draft/DraftStandingsTable';
import { PreSeason } from '../components/common/PreSeason';

export const dynamic = 'force-dynamic';

export default async function DraftPage() {
  // Cheap poll first — decides the revalidate window before fetching league
  // details.
  const game = await fetchDraftGame(REVALIDATE_LIVE);
  const revalidate = revalidateForGame(game);

  const details = await fetchDraftLeague(revalidate);
  const members = resolveDraftMembers(details);

  if (!isDraftLive(details.league)) {
    return (
      <PreSeason members={members} deadline={details.league.draft_dt} gameweekName="Draft" />
    );
  }

  // No money on the line here, so unlike the classic league's "who's
  // bottom" framing, the draft league's "This Week" view is just the whole
  // table — correct even preseason, when every row is still tied at zero.
  const rows = buildStandingsRows(members, details.standings);

  return <DraftStandingsTable rows={rows} />;
}
