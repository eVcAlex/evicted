import { Text } from '@mantine/core';
import type { DraftAwards as DraftAwardsData } from '@/lib/draft/awards';
import type { HallOfShame } from '@/lib/league/stats';
import classes from './DraftAwards.module.scss';

/**
 * Splits the season recap into two groups rather than one "Hall of Shame"
 * list like classic's — with no fine attached, a page that only names
 * losers has less to say than one that also settles who's actually good.
 */
export function DraftAwards({ shame, awards }: { shame: HallOfShame; awards: DraftAwardsData }) {
  return (
    <>
      <div className={classes.group}>
        <Text fw={600} size="sm" tt="uppercase" c="dimmed" className={classes.groupTitle}>
          The basement
        </Text>
        <div className={classes.sheet}>
          {shame.mostEvictions && (
            <div className={classes.row}>
              <div className={classes.name}>Most weeks bottom</div>
              <div className={classes.detail}>
                {shame.mostEvictions.members.map((m) => m.teamName).join(', ')} &middot;{' '}
                {shame.mostEvictions.count}
              </div>
            </div>
          )}
          {shame.worst && (
            <div className={classes.row}>
              <div className={classes.name}>Worst single week</div>
              <div className={classes.detail}>
                {shame.worst.member.teamName} &middot; {shame.worst.net} pts, GW
                {shame.worst.gameweek}
              </div>
            </div>
          )}
          {awards.mostAdrift && (
            <div className={classes.row}>
              <div className={classes.name}>Most adrift in a week</div>
              <div className={classes.detail}>
                {awards.mostAdrift.member.teamName} &middot; {awards.mostAdrift.margin} behind, GW
                {awards.mostAdrift.gameweek}
              </div>
            </div>
          )}
          {awards.benchWaste && (
            <div className={classes.row}>
              <div className={classes.name}>Most bench points wasted</div>
              <div className={classes.detail}>
                {awards.benchWaste.member.teamName} &middot; {awards.benchWaste.points}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={classes.group}>
        <Text fw={600} size="sm" tt="uppercase" c="dimmed" className={classes.groupTitle}>
          The other end
        </Text>
        <div className={classes.sheet}>
          {shame.longestCleanRun && (
            <div className={classes.row}>
              <div className={classes.name}>Longest clean run</div>
              <div className={classes.detail}>
                {shame.longestCleanRun.member.teamName} &middot; {shame.longestCleanRun.weeks}{' '}
                gameweeks
              </div>
            </div>
          )}
          {awards.bestWeek && (
            <div className={classes.row}>
              <div className={classes.name}>Best single week</div>
              <div className={classes.detail}>
                {awards.bestWeek.member.teamName} &middot; {awards.bestWeek.points} pts, GW
                {awards.bestWeek.gameweek}
              </div>
            </div>
          )}
          {awards.mostPoints && (
            <div className={classes.row}>
              <div className={classes.name}>Most points</div>
              <div className={classes.detail}>
                {awards.mostPoints.member.teamName} &middot; {awards.mostPoints.points}
              </div>
            </div>
          )}
          {awards.narrowestEscape && (
            <div className={classes.row}>
              <div className={classes.name}>Narrowest escape</div>
              <div className={classes.detail}>
                {awards.narrowestEscape.escaped.teamName} &middot; {awards.narrowestEscape.margin}{' '}
                clear of {awards.narrowestEscape.bottom.teamName}, GW
                {awards.narrowestEscape.gameweek}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
