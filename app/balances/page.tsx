import { Alert, Text, Title } from '@mantine/core';
import { MONZO_ME_URL } from '@/lib/config';
import { fetchStandings } from '@/lib/fpl/client';
import { pounds } from '@/lib/format';
import { resolveMembers } from '@/lib/league/members';
import { buildBalances } from '@/lib/league/balances';
import { buildPot } from '@/lib/league/pot';
import { safeGetBuyins, safeGetPaid, safeGetResults } from '@/lib/ledger/safe';
import { BalancesTable } from '../components/balances/BalancesTable';
import { YourBalance } from '../components/balances/YourBalance';
import classes from './page.module.scss';

export const dynamic = 'force-dynamic';

export default async function BalancesPage() {
  const [standings, resultsState, paidState, buyinsState] = await Promise.all([
    fetchStandings(3600),
    safeGetResults(),
    safeGetPaid(),
    safeGetBuyins(),
  ]);

  const { degraded: resultsDegraded } = resultsState;
  const { degraded: paidDegraded } = paidState;
  const { degraded: buyinsDegraded } = buyinsState;

  const balances = buildBalances({
    members: resolveMembers(standings),
    results: resultsState.results,
    paid: paidState.paid,
    buyins: buyinsState.buyins,
  });

  const totalOwedPence = balances.reduce((sum, balance) => sum + balance.owedPence, 0);

  // Combines two different stores (fines paid, buy-ins paid); trusting either
  // one alone would understate the real total in the pot.
  const potReady = !resultsDegraded && !paidDegraded && !buyinsDegraded;
  const pot = potReady ? buildPot(balances) : null;

  return (
    <>
      <Title order={1} className={classes.title} mb="xs">
        Balances
      </Title>
      <Text c="dimmed" size="sm" mb="lg">
        £20 buy-in, plus £2 per gameweek finished bottom — all into the pot.
      </Text>
      {pot && (
        <div className={classes.summary}>
          <span className={classes.summaryLabel}>
            Pot &middot; {pot.buyinsPaid} of {pot.buyinsTotal} paid in
          </span>
          <span className={classes.summaryValue}>{pounds(pot.potPence)}</span>
        </div>
      )}
      {resultsDegraded ? (
        <Alert color="red" variant="outline" title="Balances unavailable" mb="lg">
          Could not reach the results store. The table below does not reflect who
          actually owes money — treat every row as unknown, not clear.
        </Alert>
      ) : (
        (paidDegraded || buyinsDegraded) && (
          <Alert color="red" variant="outline" title="Payment status unavailable" mb="lg">
            Could not reach the payment store. Amounts shown may be out of date.
          </Alert>
        )
      )}
      {!resultsDegraded && (
        <>
          {totalOwedPence > 0 && (
            <Text c="dimmed" size="sm" mb="lg">
              {pounds(totalOwedPence)} still outstanding across the group.
            </Text>
          )}
          <YourBalance balances={balances} monzoUrl={MONZO_ME_URL} />
        </>
      )}
      <BalancesTable
        balances={balances}
        resultsDegraded={resultsDegraded}
        monzoUrl={MONZO_ME_URL}
      />
    </>
  );
}
