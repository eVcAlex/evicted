import { Alert, Container, Text, Title } from '@mantine/core';
import { fetchStandings } from '@/lib/fpl/client';
import { resolveMembers } from '@/lib/league/members';
import { buildBalances } from '@/lib/league/balances';
import { safeGetPaid, safeGetResults } from '@/lib/ledger/safe';
import { BalancesTable } from '../components/BalancesTable';
import { NavLinks } from '../components/NavLinks';

export const dynamic = 'force-dynamic';

export default async function BalancesPage() {
  const [standings, resultsState, paidState] = await Promise.all([
    fetchStandings(3600),
    safeGetResults(),
    safeGetPaid(),
  ]);

  const degraded = resultsState.degraded || paidState.degraded;

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
      {degraded && (
        <Alert color="orange" variant="light" title="Payment status unavailable" mb="lg">
          Could not reach the payment store. Amounts shown may be out of date.
        </Alert>
      )}
      <BalancesTable balances={balances} />
    </Container>
  );
}
