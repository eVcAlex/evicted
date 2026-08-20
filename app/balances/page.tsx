import { Container, Text, Title } from '@mantine/core';
import { fetchStandings } from '@/lib/fpl/client';
import { resolveMembers } from '@/lib/league/members';
import { buildBalances } from '@/lib/league/balances';
import { getPaid, getResults } from '@/lib/ledger/store';
import { BalancesTable } from '../components/BalancesTable';
import { NavLinks } from '../components/NavLinks';

export const dynamic = 'force-dynamic';

export default async function BalancesPage() {
  const [standings, results, paid] = await Promise.all([
    fetchStandings(3600),
    getResults(),
    getPaid(),
  ]);

  const balances = buildBalances({
    members: resolveMembers(standings),
    results,
    paid,
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
      <BalancesTable balances={balances} />
    </Container>
  );
}
