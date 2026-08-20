import { Alert, Text, Title } from '@mantine/core';
import { fetchStandings } from '@/lib/fpl/client';
import { resolveMembers } from '@/lib/league/members';
import { buildBalances } from '@/lib/league/balances';
import { safeGetPaid, safeGetResults } from '@/lib/ledger/safe';
import { BalancesTable } from '../components/BalancesTable';
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

  return (
    <>
      <Title order={1} className={classes.title} mb="xs">
        Balances
      </Title>
      <Text c="dimmed" size="sm" mb="lg">
        £2 per gameweek finished bottom.
      </Text>
      {resultsDegraded ? (
        <Alert color="orange" variant="light" title="Balances unavailable" mb="lg">
          Could not reach the results store. The table below does not reflect who
          actually owes money — treat every row as unknown, not clear.
        </Alert>
      ) : (
        paidDegraded && (
          <Alert color="orange" variant="light" title="Payment status unavailable" mb="lg">
            Could not reach the payment store. Amounts shown may be out of date.
          </Alert>
        )
      )}
      <BalancesTable balances={balances} resultsDegraded={resultsDegraded} />
    </>
  );
}
