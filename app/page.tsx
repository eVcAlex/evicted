import { Alert } from '@mantine/core';
import { fetchBootstrap, fetchHistory, fetchStandings } from '@/lib/fpl/client';
import type { EntryHistory } from '@/lib/fpl/schemas';
import { eligibleFromByEntry } from '@/lib/league/eligibility';
import { currentGameweek, nextGameweek, revalidateFor } from '@/lib/league/gameweeks';
import { resolveMembers, type Member } from '@/lib/league/members';
import { scoresForGameweek } from '@/lib/league/scoring';
import { buildSummary } from '@/lib/league/summary';
import { safeGetPaid, safeRecordSettledGameweeks } from '@/lib/ledger/safe';
import { LoserCard } from './components/LoserCard';
import { PreSeason } from './components/PreSeason';

export const dynamic = 'force-dynamic';

/** Recording must not read the render path's cache entry — see `record.ts`. */
const REVALIDATE_FOR_RECORDING = 0;

function PaymentStoreNotice() {
  return (
    <Alert color="orange" variant="light" title="Payment status unavailable" mb="lg">
      Could not reach the payment store. Payment state below is unknown, not
      settled, and recently finished gameweeks may not have been recorded yet.
    </Alert>
  );
}

async function loadHistories(
  members: Member[],
  revalidate: number,
): Promise<Map<number, EntryHistory>> {
  return new Map(
    await Promise.all(
      members.map(
        async (member) =>
          [member.entryId, await fetchHistory(member.entryId, revalidate)] as const,
      ),
    ),
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
      <>
        {degraded && <PaymentStoreNotice />}
        <PreSeason
          members={members}
          deadline={next?.deadline_time ?? null}
          gameweekName={next?.name ?? null}
        />
      </>
    );
  }

  const eligibleFrom = eligibleFromByEntry({
    bootstrap,
    members,
    startEvent: standings.league.start_event,
  });

  const histories = await loadHistories(members, revalidate);

  const { degraded: recordDegraded } = await safeRecordSettledGameweeks({
    bootstrap,
    members,
    eligibleFrom,
    fetchHistories: () => loadHistories(members, REVALIDATE_FOR_RECORDING),
  });

  const summary = buildSummary({
    gameweek: current.id,
    provisional: !current.data_checked,
    members,
    scores: scoresForGameweek(histories, current.id, eligibleFrom),
  });

  const { paid, degraded: paidDegraded } = await safeGetPaid();

  return (
    <>
      {(paidDegraded || recordDegraded) && <PaymentStoreNotice />}
      <LoserCard summary={summary} paid={paid} degraded={paidDegraded} />
    </>
  );
}
