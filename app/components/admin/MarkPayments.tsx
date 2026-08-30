import { Alert, Text } from '@mantine/core';
import type { Balance } from '@/lib/league/balances';
import { Avatar } from '../common/Avatar';
import { PaymentToggle } from './PaymentToggle';
import classes from './MarkPayments.module.scss';

/**
 * The one place fines and buy-ins get marked, now that the public pages are
 * read-only. One row per member who currently owes something; each row shows
 * the buy-in (if owed) plus a toggle for every gameweek they finished bottom -
 * already-paid ones included, so a mistaken mark can be reversed from here.
 */
export function MarkPayments({
  balances,
  resultsDegraded,
}: {
  balances: Balance[];
  resultsDegraded: boolean;
}) {
  if (resultsDegraded) {
    return (
      <div className={classes.section}>
        <span className={classes.kicker}>Mark payments</span>
        <Alert color="red" variant="outline" title="Results unavailable" mt="sm">
          Could not reach the results store. Marking is disabled until it is back,
          so a fine is not recorded against stale data.
        </Alert>
      </div>
    );
  }

  const owing = balances.filter((b) => b.buyinOwed || b.unpaid.length > 0);

  return (
    <div className={classes.section}>
      <span className={classes.kicker}>Mark payments</span>

      {owing.length === 0 && (
        <Text size="sm" c="dimmed" mt="sm">
          Everyone is paid up.
        </Text>
      )}

      {owing.map((balance) => {
        const unpaid = new Set(balance.unpaid);
        return (
          <div key={balance.member.entryId} className={classes.row}>
            <Avatar
              teamName={balance.member.teamName}
              managerName={balance.member.managerName}
              size={32}
            />
            <span className={classes.name}>{balance.member.teamName}</span>
            <span className={classes.chips}>
              {balance.buyinOwed && (
                <PaymentToggle
                  endpoint="/api/admin/toggle-buyin"
                  requestBody={{ entryId: balance.member.entryId }}
                  paid={false}
                  label="Buy-in"
                />
              )}
              {balance.lost.map((gameweek) => (
                <PaymentToggle
                  key={gameweek}
                  endpoint="/api/admin/toggle"
                  requestBody={{ gameweek, entryId: balance.member.entryId }}
                  paid={!unpaid.has(gameweek)}
                  label={`GW${gameweek}`}
                />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
