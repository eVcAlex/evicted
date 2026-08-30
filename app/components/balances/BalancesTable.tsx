'use client';

import { Group } from '@mantine/core';
import { pounds } from '@/lib/format';
import type { Balance } from '@/lib/league/balances';
import { AdminToggle } from '../common/AdminToggle';
import { Avatar } from '../common/Avatar';
import { useMe } from '../common/MeProvider';
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
  const { me } = useMe();

  return (
    <div className={classes.sheet}>
      {balances.map((balance) => {
        const isYou = me?.entryId === balance.member.entryId;
        const state = resultsDegraded
          ? 'unknown'
          : balance.owedPence > 0
            ? 'owes'
            : balance.owedPence < 0
              ? 'credit'
              : 'clear';

        const toneClass =
          state === 'clear'
            ? classes.figClear
            : state === 'credit'
              ? classes.figCredit
              : state === 'owes'
                ? classes.figOwes
                : classes.figUnknown;
        const figure = state === 'unknown' ? '–' : pounds(Math.abs(balance.owedPence));
        const canPay = state === 'owes' && Boolean(monzoUrl);
        const unit = canPay ? 'Pay' : state;

        const figChip = canPay ? (
          <a
            className={`${classes.figChip} ${toneClass}`}
            href={monzoUrl!}
            target="_blank"
            rel="noopener noreferrer"
          >
            <span className={classes.figValue}>{figure}</span>
            <span className={classes.figUnit}>{unit}</span>
          </a>
        ) : (
          <span className={`${classes.figChip} ${toneClass}`}>
            <span className={classes.figValue}>{figure}</span>
            <span className={classes.figUnit}>{unit}</span>
          </span>
        );

        return (
          <div
            key={balance.member.entryId}
            className={`${classes.row} ${classes[state]}${isYou ? ` ${classes.you}` : ''}`}
          >
            <div className={classes.rowMain}>
              <Avatar
                teamName={balance.member.teamName}
                managerName={balance.member.managerName}
                size={40}
              />
              <div className={classes.identity}>
                <span className={classes.name}>{balance.member.teamName}</span>
                <span className={classes.manager}>
                  {balance.departed ? 'Left the league' : balance.member.managerName}
                </span>
              </div>

              {figChip}
            </div>

            {!resultsDegraded && (
              <div className={classes.meta}>
                {balance.lost.length} lost &middot; {pounds(balance.paidPence)} paid
              </div>
            )}

            {!resultsDegraded && (balance.buyinOwed || balance.unpaid.length > 0) && (
              <Group gap={6} mt="xs" className={classes.toggles}>
                {balance.buyinOwed && (
                  <AdminToggle
                    endpoint="/api/admin/toggle-buyin"
                    requestBody={{ entryId: balance.member.entryId }}
                    paid={false}
                    label="Buy-in"
                  />
                )}
                {balance.unpaid.map((gameweek) => (
                  <AdminToggle
                    key={gameweek}
                    endpoint="/api/admin/toggle"
                    requestBody={{ gameweek, entryId: balance.member.entryId }}
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
