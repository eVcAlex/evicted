import { Alert, Container } from '@mantine/core';
import { fetchBootstrap, fetchHistory, fetchStandings } from '@/lib/fpl/client';
import { currentGameweek, nextGameweek, revalidateFor } from '@/lib/league/gameweeks';
import { resolveMembers } from '@/lib/league/members';
import { recordSettledGameweeks } from '@/lib/league/record';
import { scoresForGameweek } from '@/lib/league/scoring';
import { buildSummary } from '@/lib/league/summary';
import { safeGetPaid } from '@/lib/ledger/safe';
import { LoserCard } from './components/LoserCard';
import { NavLinks } from './components/NavLinks';
import { PreSeason } from './components/PreSeason';

export const dynamic = 'force-dynamic';

function PaymentStoreNotice() {
  return (
    <Alert color="orange" variant="light" title="Payment status unavailable" mb="lg">
      Could not reach the payment store. Amounts shown may be out of date.
    </Alert>
  );
}

export default async function HomePage() {
  const bootstrap = await fetchBootstrap(3600);
  const revalidate = revalidateFor(bootstrap);
  const standings = await fetchStandings(revalidate);
  const members = resolveMembers(standings);
  const current = currentGameweek(bootstrap);

  if (!current) {
    const next = nextGameweek(bootstrap);
    const { degraded } = await safeGetPaid();
    return (
      <Container size="sm" py="xl">
        <NavLinks />
        {degraded && <PaymentStoreNotice />}
        <PreSeason
          members={members}
          deadline={next?.deadline_time ?? null}
          gameweekName={next?.name ?? null}
        />
      </Container>
    );
  }

  const histories = new Map(
    await Promise.all(
      members.map(
        async (member) =>
          [member.entryId, await fetchHistory(member.entryId, revalidate)] as const,
      ),
    ),
  );

  await recordSettledGameweeks({ bootstrap, histories });

  const summary = buildSummary({
    gameweek: current.id,
    provisional: !current.data_checked,
    members,
    scores: scoresForGameweek(histories, current.id),
  });

  const { paid, degraded } = await safeGetPaid();

  return (
    <Container size="sm" py="xl">
      <NavLinks />
      {degraded && <PaymentStoreNotice />}
      <LoserCard summary={summary} paid={paid} />
    </Container>
  );
}
