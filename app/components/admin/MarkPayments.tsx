import { Alert, Text } from '@mantine/core';
import type { Balance } from '@/lib/league/balances';
import { Avatar } from '../common/Avatar';
import { PaymentToggle } from './PaymentToggle';
import classes from './MarkPayments.module.scss';

/**
 * The one place fines and buy-ins get marked, now that the public pages are
 * read-only. One row per member who has ever finished bottom or still owes the
 * buy-in. Each row shows a toggle for every gameweek they finished bottom
 * (already-paid ones included) and, for a current member, the buy-in toggle in
 * whichever state it is in - so a mark made by mistake can be undone from here.
 * A member who never finished bottom and does not owe the buy-in has no row.
 */
export function MarkPayments({
  balances,
  resultsDegraded,
  paymentStateDegraded = false,
}: {
  balances: Balance[];
  resultsDegraded: boolean;
  paymentStateDegraded?: boolean;
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

  const rows = balances.filter((b) => b.lost.length > 0 || b.buyinOwed);

  return (
    <div className={classes.section}>
      <span className={classes.kicker}>Mark payments</span>

      {paymentStateDegraded && (
        <Alert
          color="red"
          variant="outline"
          title="Payment status unavailable"
          mt="sm"
        >
          Could not reach the payment store. Amounts and paid state below may be
          wrong.
        </Alert>
      )}

      {rows.length === 0 && (
        <Text size="sm" c="dimmed" mt="sm">
          Everyone is paid up.
        </Text>
      )}

      {rows.map((balance) => {
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
              {!balance.departed && (
                <PaymentToggle
                  endpoint="/api/admin/toggle-buyin"
                  requestBody={{ entryId: balance.member.entryId }}
                  paid={!balance.buyinOwed}
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
