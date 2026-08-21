import { Alert, Text, Title } from '@mantine/core';
import { fetchStandings } from '@/lib/fpl/client';
import { resolveMembers } from '@/lib/league/members';
import { buildHallOfShame } from '@/lib/league/stats';
import { safeGetResults } from '@/lib/ledger/safe';
import { SeasonGrid } from '../components/SeasonGrid';
import classes from './page.module.scss';

export const dynamic = 'force-dynamic';

/** Below this many recorded gameweeks, "longest clean run" etc. is noise. */
const MIN_GAMEWEEKS_FOR_STATS = 3;

export default async function SeasonPage() {
  const [standings, { results, degraded }] = await Promise.all([
    fetchStandings(3600),
    safeGetResults(),
  ]);

  const members = resolveMembers(standings);
  const shame = results.size >= MIN_GAMEWEEKS_FOR_STATS
    ? buildHallOfShame({ members, results })
    : null;

  return (
    <>
      <Title order={1} className={classes.title} mb="xs">
        Season
      </Title>
      <Text c="dimmed" size="sm" mb="lg">
        Every gameweek, every manager, one glance.
      </Text>

      {degraded && (
        <Alert color="red" variant="outline" title="Season data unavailable" mb="lg">
          Could not reach the results store. The grid below may be missing recent
          gameweeks.
        </Alert>
      )}

      <SeasonGrid members={members} results={results} />

      {shame && (
        <div className={classes.shame}>
          <Text fw={600} size="sm" tt="uppercase" c="dimmed" className={classes.shameTitle}>
            Hall of shame
          </Text>
          <div className={classes.sheet}>
            {shame.mostEvictions && (
              <div className={classes.row}>
                <div className={classes.name}>Most evictions</div>
                <div className={classes.manager}>
                  {shame.mostEvictions.members.map((m) => m.teamName).join(', ')} &middot;{' '}
                  {shame.mostEvictions.count}
                </div>
              </div>
            )}
            {shame.worst && (
              <div className={classes.row}>
                <div className={classes.name}>Worst single score</div>
                <div className={classes.manager}>
                  {shame.worst.member.teamName} &middot; {shame.worst.net} net, GW
                  {shame.worst.gameweek}
                </div>
              </div>
            )}
            {shame.longestCleanRun && (
              <div className={classes.row}>
                <div className={classes.name}>Longest current clean run</div>
                <div className={classes.manager}>
                  {shame.longestCleanRun.member.teamName} &middot;{' '}
                  {shame.longestCleanRun.weeks} gameweeks
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
