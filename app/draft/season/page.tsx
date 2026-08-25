import { Text, Title } from '@mantine/core';
import { buildDraftAwards } from '@/lib/draft/awards';
import { fetchDraftBootstrap, fetchDraftGame, fetchDraftLeague } from '@/lib/draft/client';
import { REVALIDATE_LIVE, revalidateForGame, settledGameweeks } from '@/lib/draft/gameweeks';
import { loadDraftHistories } from '@/lib/draft/histories';
import { resolveDraftMembers } from '@/lib/draft/members';
import { buildSeasonResults } from '@/lib/draft/season';
import { buildHallOfShame } from '@/lib/league/stats';
import { DraftAwards } from '../../components/draft/DraftAwards';
import { SeasonGrid } from '../../components/season/SeasonGrid';
import classes from './page.module.scss';

export const dynamic = 'force-dynamic';

/** Below this many settled gameweeks, "longest clean run" etc. is noise. */
const MIN_GAMEWEEKS_FOR_STATS = 3;

export default async function DraftSeasonPage() {
  const game = await fetchDraftGame(REVALIDATE_LIVE);
  const revalidate = revalidateForGame(game);

  const [bootstrap, details] = await Promise.all([
    fetchDraftBootstrap(revalidate),
    fetchDraftLeague(revalidate),
  ]);

  const members = resolveDraftMembers(details);
  const histories = await loadDraftHistories(members, revalidate);
  const gameweeks = settledGameweeks(bootstrap, details.league);
  const results = buildSeasonResults({ histories, gameweeks, members });

  const enoughData = results.size >= MIN_GAMEWEEKS_FOR_STATS;
  const shame = enoughData ? buildHallOfShame({ members, results }) : null;
  const awards = enoughData ? buildDraftAwards({ members, histories, results }) : null;

  return (
    <>
      <Title order={1} className={classes.title} mb="xs">
        Draft season
      </Title>
      <Text c="dimmed" size="sm" mb="lg">
        Every gameweek, every manager, one glance.
      </Text>

      <SeasonGrid members={members} results={results} verb="bottom" league="draft" />

      {shame && awards && <DraftAwards shame={shame} awards={awards} />}
    </>
  );
}
