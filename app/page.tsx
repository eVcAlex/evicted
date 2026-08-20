import { Container } from '@mantine/core';
import { fetchBootstrap, fetchStandings } from '@/lib/fpl/client';
import { nextGameweek, revalidateFor } from '@/lib/league/gameweeks';
import { resolveMembers } from '@/lib/league/members';
import { PreSeason } from './components/PreSeason';

export default async function HomePage() {
  const bootstrap = await fetchBootstrap(3600);
  const revalidate = revalidateFor(bootstrap);
  const standings = await fetchStandings(revalidate);
  const members = resolveMembers(standings);
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
