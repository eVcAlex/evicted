import { Alert, Text, Title } from '@mantine/core';
import { MONZO_ME_URL } from '@/lib/config';
import { fetchStandings } from '@/lib/fpl/client';
import { pounds } from '@/lib/format';
import { resolveMembers } from '@/lib/league/members';
import { buildBalances } from '@/lib/league/balances';
import { safeGetPaid, safeGetResults } from '@/lib/ledger/safe';
import { BalancesTable } from '../components/balances/BalancesTable';
import { YourBalance } from '../components/balances/YourBalance';
import classes from './page.module.scss';

export const dynamic = 'force-dynamic';

export default async function BalancesPage() {
  const [standings, resultsState, paidState] = await Promise.all([
    fetchStandings(3600),
    safeGetResults(),
    safeGetPaid(),
  ]);

  const { degraded: resultsDegraded } = resultsState;
  const { degraded: paidDegraded } = paidState;

  const balances = buildBalances({
    members: resolveMembers(standings),
    results: resultsState.results,
    paid: paidState.paid,
  });

  const totalOwedPence = balances.reduce((sum, balance) => sum + balance.owedPence, 0);

  return (
    <>
      <Title order={1} className={classes.title} mb="xs">
        Balances
      </Title>
      <Text c="dimmed" size="sm" mb="lg">
        £2 per gameweek finished bottom.
      </Text>
      {!resultsDegraded && (
        <div className={classes.summary}>
          <span className={classes.summaryLabel}>
            {totalOwedPence > 0 ? 'Outstanding across the group' : 'Pot status'}
          </span>
          <span className={classes.summaryValue}>
            {totalOwedPence > 0 ? pounds(totalOwedPence) : 'All clear'}
          </span>
        </div>
      )}
      {resultsDegraded ? (
        <Alert color="red" variant="outline" title="Balances unavailable" mb="lg">
          Could not reach the results store. The table below does not reflect who
          actually owes money — treat every row as unknown, not clear.
        </Alert>
      ) : (
        paidDegraded && (
          <Alert color="red" variant="outline" title="Payment status unavailable" mb="lg">
            Could not reach the payment store. Amounts shown may be out of date.
          </Alert>
        )
      )}
      {!resultsDegraded && <YourBalance balances={balances} monzoUrl={MONZO_ME_URL} />}
      <BalancesTable
        balances={balances}
        resultsDegraded={resultsDegraded}
        monzoUrl={MONZO_ME_URL}
      />
    </>
  );
}
