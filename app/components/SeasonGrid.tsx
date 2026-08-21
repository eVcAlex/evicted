import { Alert } from '@mantine/core';
import type { GameweekResult } from '@/lib/ledger/store';
import { lossesByEntry } from '@/lib/league/history';
import type { Member } from '@/lib/league/members';
import { Avatar } from './Avatar';
import classes from './SeasonGrid.module.scss';

/**
 * Every gameweek × every manager, at a glance: a filled cell where they were
 * evicted, a hollow ring where they played and survived, nothing where they
 * were not yet a member. Rows sorted worst-first so the grid doubles as a
 * leaderboard.
 */
export function SeasonGrid({
  members,
  results,
}: {
  members: Member[];
  results: Map<number, GameweekResult>;
}) {
  const gameweeks = [...results.keys()].sort((a, b) => a - b);

  if (gameweeks.length === 0) {
    return (
      <Alert color="gray" variant="light" title="No gameweeks settled yet">
        The season grid fills in as each gameweek's bonus points and
        auto-substitutions are confirmed.
      </Alert>
    );
  }

  const losses = lossesByEntry(results);
  const rows = [...members].sort((a, b) => {
    const diff = (losses.get(b.entryId)?.length ?? 0) - (losses.get(a.entryId)?.length ?? 0);
    return diff !== 0 ? diff : a.teamName.localeCompare(b.teamName);
  });

  return (
    <div className={classes.scroll}>
      <table className={classes.table}>
        <thead>
          <tr>
            <th className={classes.corner} scope="col">
              <span className={classes.srOnly}>Team</span>
            </th>
            {gameweeks.map((gw) => (
              <th key={gw} className={classes.gwHeader} scope="col">
                GW{gw}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((member) => {
            const evictions = losses.get(member.entryId)?.length ?? 0;
            return (
              <tr key={member.entryId}>
                <th className={classes.rowHeader} scope="row">
                  <div className={classes.rowIdentity}>
                    <Avatar teamName={member.teamName} managerName={member.managerName} size={28} />
                    <span className={classes.teamName}>{member.teamName}</span>
                  </div>
                  <span className={classes.evictionCount}>{evictions}</span>
                </th>
                {gameweeks.map((gw) => {
                  const result = results.get(gw)!;
                  const net = result.scores[member.entryId];
                  const played = member.entryId in result.scores;
                  const evicted = result.losers.includes(member.entryId);
                  const label = played
                    ? `GW${gw} — ${member.teamName}, ${net} pts${evicted ? ', evicted' : ''}`
                    : `GW${gw} — not yet a member`;

                  return (
                    <td key={gw} className={classes.cell}>
                      <span
                        className={
                          evicted ? classes.evicted : played ? classes.played : classes.absent
                        }
                        title={label}
                        aria-label={label}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
