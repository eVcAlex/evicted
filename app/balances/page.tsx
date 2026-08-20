import { Alert, Container, Text, Title } from '@mantine/core';
import { fetchStandings } from '@/lib/fpl/client';
import { resolveMembers } from '@/lib/league/members';
import { buildBalances } from '@/lib/league/balances';
import { safeGetPaid, safeGetResults } from '@/lib/ledger/safe';
import { BalancesTable } from '../components/BalancesTable';
import { MonzoConnect } from '../components/MonzoConnect';
import { NavLinks } from '../components/NavLinks';

export const dynamic = 'force-dynamic';

export default async function BalancesPage({
  searchParams,
}: {
  searchParams: Promise<{ monzo?: string }>;
}) {
  const [standings, resultsState, paidState, params] = await Promise.all([
    fetchStandings(3600),
    safeGetResults(),
    safeGetPaid(),
    searchParams,
  ]);

  const { degraded: resultsDegraded } = resultsState;
  const { degraded: paidDegraded } = paidState;

  const balances = buildBalances({
    members: resolveMembers(standings),
    results: resultsState.results,
    paid: paidState.paid,
  });

  return (
    <Container size="sm" py="xl">
      <NavLinks />
      <Title order={1} mb="xs">
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
      {params.monzo === 'connected' && (
        <Alert color="green" variant="light" title="Monzo connected" mb="lg">
          Webhook registered. Capture-phase only — send a test payment, then check
          /api/monzo/captured.
        </Alert>
      )}
      {params.monzo === 'webhook_registration_failed' && (
        <Alert color="red" variant="light" title="Monzo connected, but webhook registration failed" mb="lg">
          The account is authorised, but nothing will arrive until this is retried.
          Check server logs for the cause.
        </Alert>
      )}
      <BalancesTable balances={balances} resultsDegraded={resultsDegraded} />
      <Text c="dimmed" size="xs" mt="lg">
        <MonzoConnect />
      </Text>
    </Container>
  );
}
