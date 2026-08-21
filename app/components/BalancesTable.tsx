'use client';

import { Group } from '@mantine/core';
import { pounds } from '@/lib/format';
import type { Balance } from '@/lib/league/balances';
import { AdminToggle } from './AdminToggle';
import { Avatar } from './Avatar';
import classes from './BalancesTable.module.scss';

export function BalancesTable({
  balances,
  resultsDegraded,
  monzoUrl,
}: {
  balances: Balance[];
  resultsDegraded: boolean;
  /** A monzo.me link for the outstanding amount; `null` when unconfigured. */
  monzoUrl: string | null;
}) {
  return (
    <div className={classes.sheet}>
      {balances.map((balance) => {
        const state = resultsDegraded
          ? 'unknown'
          : balance.owedPence > 0
            ? 'owes'
            : 'clear';

        return (
          <div key={balance.member.entryId} className={`${classes.row} ${classes[state]}`}>
            <div className={classes.rowMain}>
              <Avatar
                teamName={balance.member.teamName}
                managerName={balance.member.managerName}
                size={44}
              />
              <span className={classes.name}>{balance.member.teamName}</span>
              <span className={classes.manager}>
                {balance.departed ? 'Left the league' : balance.member.managerName}
              </span>

              <div className={classes.amount}>
                {state === 'unknown' && <span className={classes.tagUnknown}>Unknown</span>}
                {state === 'clear' && <span className={classes.tagClear}>Clear</span>}
                {state === 'owes' && (
                  <>
                    <span className={classes.tagOwes}>Owes</span>
                    <span className={classes.owed}>{pounds(balance.owedPence)}</span>
                    {monzoUrl && (
                      <a
                        className={classes.pay}
                        href={monzoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Pay
                      </a>
                    )}
                  </>
                )}
              </div>
            </div>

            {!resultsDegraded && (
              <div className={classes.meta}>
                {balance.lost.length} lost &middot; {pounds(balance.paidPence)} paid
              </div>
            )}

            {!resultsDegraded && balance.unpaid.length > 0 && (
              <Group gap={6} mt="xs" className={classes.toggles}>
                {balance.unpaid.map((gameweek) => (
                  <AdminToggle
                    key={gameweek}
                    gameweek={gameweek}
                    entryId={balance.member.entryId}
                    paid={false}
                    label={`GW${gameweek}`}
                  />
                ))}
              </Group>
            )}
          </div>
        );
      })}
    </div>
  );
}
