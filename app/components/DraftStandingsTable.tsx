import type { StandingsRow } from '@/lib/draft/standings';
import { Avatar } from './Avatar';
import { MeRow } from './MeRow';
import { YouTag } from './YouTag';
import classes from './DraftStandingsTable.module.scss';

/**
 * The draft league's "at a glance" view — no money on the line, so unlike
 * `LoserCard`/`BasementCard` there's no single manager to call out, just the
 * whole table. Mirrors the official site's own standings layout, including
 * the synthetic "AVERAGE" benchmark row every draft league gets.
 */
export function DraftStandingsTable({ rows }: { rows: StandingsRow[] }) {
  return (
    <div className={classes.scroll}>
      <table className={classes.table}>
        <thead>
          <tr>
            <th className={classes.rank} scope="col">
              Rank
            </th>
            <th className={classes.team} scope="col">
              Team &amp; Manager
            </th>
            <th className={classes.stat} scope="col">
              W
            </th>
            <th className={classes.stat} scope="col">
              D
            </th>
            <th className={classes.stat} scope="col">
              L
            </th>
            <th className={classes.stat} scope="col">
              +/&minus;
            </th>
            <th className={classes.stat} scope="col">
              Pts
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isAverage = row.member.teamId === null;
            const rowContent = (
              <>
                <td className={classes.rank}>{row.rank ?? '–'}</td>
                <td className={classes.team}>
                  {isAverage ? (
                    <span className={classes.teamName}>{row.member.teamName}</span>
                  ) : (
                    <div className={classes.identity}>
                      <Avatar
                        teamName={row.member.teamName}
                        managerName={row.member.managerName}
                        size={28}
                      />
                      <div className={classes.names}>
                        <span className={classes.teamName}>
                          {row.member.teamName}
                          <YouTag entryId={row.member.entryId} league="draft" />
                        </span>
                        <span className={classes.managerName}>{row.member.managerName}</span>
                      </div>
                    </div>
                  )}
                </td>
                <td className={classes.stat}>{row.won}</td>
                <td className={classes.stat}>{row.drawn}</td>
                <td className={classes.stat}>{row.lost}</td>
                <td className={classes.stat}>{row.pointsFor - row.pointsAgainst}</td>
                <td className={classes.statTotal}>{row.total}</td>
              </>
            );

            if (isAverage) {
              return (
                <tr key={row.member.entryId} className={`${classes.row} ${classes.average}`}>
                  {rowContent}
                </tr>
              );
            }

            return (
              <MeRow
                key={row.member.entryId}
                component="tr"
                league="draft"
                entryId={row.member.entryId}
                className={classes.row}
                meClassName={classes.you}
              >
                {rowContent}
              </MeRow>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
