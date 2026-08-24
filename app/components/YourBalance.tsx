'use client';

import { pounds } from '@/lib/format';
import type { Balance } from '@/lib/league/balances';
import { useMe } from './MeProvider';
import classes from './YourBalance.module.scss';

/**
 * A personal line above the shared balances table — "You owe £6 across 3
 * weeks" or "You're all clear" — for whoever picked themselves on
 * `/settings`. Renders nothing without a stored identity, or if that
 * identity isn't in this league's roster (e.g. picked from the draft-only
 * side of the join).
 */
export function YourBalance({
  balances,
  monzoUrl,
}: {
  balances: Balance[];
  monzoUrl: string | null;
}) {
  const { me } = useMe();
  if (!me) return null;

  const mine = balances.find((balance) => balance.member.entryId === me.entryId);
  if (!mine) return null;

  const owes = mine.owedPence > 0;

  return (
    <div className={owes ? `${classes.line} ${classes.owes}` : classes.line}>
      <span className={classes.label}>
        {owes
          ? `You owe ${pounds(mine.owedPence)} across ${mine.unpaid.length} week${mine.unpaid.length === 1 ? '' : 's'}`
          : "You're all clear"}
      </span>
      {owes && monzoUrl && (
        <a href={monzoUrl} target="_blank" rel="noopener noreferrer" className={classes.pay}>
          Pay
        </a>
      )}
    </div>
  );
}
