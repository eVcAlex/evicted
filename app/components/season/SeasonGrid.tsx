import type { GridResult } from '@/lib/gameweekResult';
import type { Identity } from '@/lib/identity';
import { lossesByEntry } from '@/lib/league/history';
import { Avatar } from '../common/Avatar';
import { MeRow } from '../common/MeRow';
import classes from './SeasonGrid.module.scss';

const SEASON_LENGTH = 38;
/** How many gameweeks a phone shows at once, ending near the latest settled one. */
const PHONE_WINDOW = 12;

/**
 * Every manager across the whole season in one fixed-width strip: a filled
 * square where they were evicted, a soft square where they played and
 * survived, a dashed outline for a gameweek still to come. One square per
 * gameweek, so the width is the same at GW6 and GW38 instead of growing a
 * column per week. Rows sorted worst-first so the grid doubles as a
 * leaderboard. On phones the strip shows a window of the latest gameweeks.
 */
export function SeasonGrid({
  members,
  results,
  verb = 'evicted',
  league,
  seasonLength = SEASON_LENGTH,
}: {
  members: Identity[];
  results: Map<number, GridResult>;
  /** The word describing a filled cell, e.g. "bottom" for a no-money league. */
  verb?: string;
  /** Classic and draft use different id spaces for the same human, see
   * `lib/draft/members.ts`, so "is this row me?" needs to know which. */
  league: 'classic' | 'draft';
  /** Total gameweeks in the season. */
  seasonLength?: number;
}) {
  const settled = [...results.keys()].sort((a, b) => a - b);

  if (settled.length === 0) {
    return (
      <div className={classes.empty}>
        <span className={classes.emptyKicker}>Season</span>
        <p className={classes.emptyHeading}>Nothing settled yet</p>
        <p className={classes.emptyBody}>
          The grid fills in as each gameweek&rsquo;s bonus points and
          auto-substitutions are confirmed.
        </p>
        <div className={classes.emptyPreview}>
          <div className={classes.emptyPreviewCells}>
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={classes.emptyPreviewCell} />
            ))}
          </div>
          <span className={classes.emptyPreviewLabel}>GW1&ndash;5 waiting</span>
        </div>
      </div>
    );
  }

  const total = Math.max(seasonLength, settled[settled.length - 1]);
  const lastSettled = settled[settled.length - 1];
  const phoneStart = Math.min(Math.max(1, lastSettled - (PHONE_WINDOW - 4)), total - PHONE_WINDOW + 1);
  const gameweeks = Array.from({ length: total }, (_, i) => i + 1);
  const outsidePhone = (gw: number) => gw < phoneStart || gw >= phoneStart + PHONE_WINDOW;

  const losses = lossesByEntry(results);
  const rows = [...members].sort((a, b) => {
    const diff = (losses.get(b.entryId)?.length ?? 0) - (losses.get(a.entryId)?.length ?? 0);
    return diff !== 0 ? diff : a.teamName.localeCompare(b.teamName);
  });

  return (
    <div className={classes.board}>
      <div className={classes.headRow}>
        <span />
        <span />
        <div className={classes.cells}>
          {gameweeks.map((gw) => (
            <span
              key={gw}
              className={`${classes.tick} ${outsidePhone(gw) ? classes.farCell : ''}`.trim()}
            >
              {gw === 1 || gw % 5 === 0 || gw === total ? gw : ''}
            </span>
          ))}
        </div>
      </div>

      {rows.map((member) => {
        const evictions = losses.get(member.entryId)?.length ?? 0;
        return (
          <MeRow
            key={member.entryId}
            league={league}
            entryId={member.entryId}
            className={classes.row}
            meClassName={classes.you}
          >
            <div className={classes.identity}>
              <Avatar teamName={member.teamName} managerName={member.managerName} size={28} />
              <span className={evictions > 0 ? classes.teamName : classes.teamNameQuiet}>
                {member.teamName}
              </span>
            </div>
            <span className={evictions > 0 ? classes.count : classes.countQuiet}>{evictions}</span>
            <div className={classes.cells}>
              {gameweeks.map((gw) => {
                const far = outsidePhone(gw) ? ` ${classes.farCell}` : '';
                const result = results.get(gw);
                if (!result) {
                  return (
                    <span
                      key={gw}
                      className={`${classes.cell} ${classes.todo}${far}`}
                      title={`GW${gw}: to play`}
                    />
                  );
                }
                const net = result.scores[member.entryId];
                const played = member.entryId in result.scores;
                const evicted = result.losers.includes(member.entryId);
                const label = played
                  ? `GW${gw}: ${member.teamName}, ${net} pts${evicted ? `, ${verb}` : ''}`
                  : `GW${gw}: not yet a member`;
                const state = evicted ? classes.evicted : played ? classes.played : classes.absent;
                return (
                  <span
                    key={gw}
                    className={`${classes.cell} ${state}${far}`}
                    title={label}
                    aria-label={label}
                  />
                );
              })}
            </div>
          </MeRow>
        );
      })}

      <div className={classes.legend}>
        <span>
          Played {settled.length} of {total}
        </span>
        <span className={classes.legendKeys}>
          <span className={classes.keyEvicted}>Evicted</span>
          <span>Safe</span>
          <span>To play</span>
        </span>
      </div>
    </div>
  );
}
