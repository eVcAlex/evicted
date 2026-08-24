import { Alert } from '@mantine/core';
import { fetchBootstrap, fetchStandings } from '@/lib/fpl/client';
import { checkAndNotifySettled, loadHistories } from '@/lib/league/checkAndNotify';
import { eligibleFromByEntry } from '@/lib/league/eligibility';
import { currentGameweek, nextGameweek, revalidateFor } from '@/lib/league/gameweeks';
import { lossesByEntry } from '@/lib/league/history';
import { resolveMembers } from '@/lib/league/members';
import { scoresForGameweek } from '@/lib/league/scoring';
import { buildSummary } from '@/lib/league/summary';
import { safeGetPaid } from '@/lib/ledger/safe';
import { LoserCard } from './components/LoserCard';
import { PreSeason } from './components/PreSeason';

export const dynamic = 'force-dynamic';

function PaymentStoreNotice() {
  return (
    <Alert color="red" variant="outline" title="Payment status unavailable" mb="lg">
      Could not reach the payment store. Payment state below is unknown, not
      settled, and recently finished gameweeks may not have been recorded yet.
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
      <>
        {degraded && <PaymentStoreNotice />}
        <PreSeason
          members={members}
          deadline={next?.deadline_time ?? null}
          gameweekName={next?.name ?? null}
          league="classic"
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

  // Reused, not refetched: `checkAndNotifySettled` already reads the full
  // ledger to decide what's pending, so the same map that came back covers
  // every gameweek recorded before this one — exactly the history a quip
  // needs to notice a streak.
  const { results: recordedResults, degraded: recordDegraded } = await checkAndNotifySettled({
    bootstrap,
    members,
    eligibleFrom,
  });
  const previousLosses = lossesByEntry(recordedResults);

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
      <LoserCard
        summary={summary}
        paid={paid}
        degraded={paidDegraded}
        previousLosses={previousLosses}
      />
    </>
  );
}
