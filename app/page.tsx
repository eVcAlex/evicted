import { Container } from '@mantine/core';
import { fetchBootstrap, fetchHistory, fetchStandings } from '@/lib/fpl/client';
import { currentGameweek, nextGameweek, revalidateFor } from '@/lib/league/gameweeks';
import { resolveMembers } from '@/lib/league/members';
import { recordSettledGameweeks } from '@/lib/league/record';
import { scoresForGameweek } from '@/lib/league/scoring';
import { buildSummary } from '@/lib/league/summary';
import { getPaid } from '@/lib/ledger/store';
import { LoserCard } from './components/LoserCard';
import { PreSeason } from './components/PreSeason';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const bootstrap = await fetchBootstrap(3600);
  const revalidate = revalidateFor(bootstrap);
  const standings = await fetchStandings(revalidate);
  const members = resolveMembers(standings);
  const current = currentGameweek(bootstrap);

  if (!current) {
    const next = nextGameweek(bootstrap);
    return (
      <Container size="sm" py="xl">
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

  const paid = await getPaid();

  return (
    <Container size="sm" py="xl">
      <LoserCard summary={summary} paid={paid} />
    </Container>
  );
}
