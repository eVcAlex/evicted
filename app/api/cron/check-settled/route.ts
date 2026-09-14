import { NextResponse } from 'next/server';
import { fetchBootstrap, fetchStandings } from '@/lib/fpl/client';
import { checkCronSecret } from '@/lib/cron';
import { checkAndRecordSettled } from '@/lib/league/checkAndRecord';
import { eligibleFromByEntry } from '@/lib/league/eligibility';
import { currentGameweek, revalidateFor } from '@/lib/league/gameweeks';
import { resolveMembers } from '@/lib/league/members';

/**
 * The reliable trigger for recording a settled gameweek and chasing credit
 * for it. `HomePage` also records lazily on whatever visit happens first, but
 * that could be hours after a gameweek actually settles — Vercel Hobby cron
 * only runs once daily, which is why this exists as a GitHub Actions schedule
 * hitting this route every ~10-15 min instead. Both paths funnel through the
 * same `saveResult` HSETNX, so there is no risk of double-recording.
 */
export async function POST(request: Request) {
  if (!checkCronSecret(request.headers.get('x-cron-secret'))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const bootstrap = await fetchBootstrap();

  // Nothing can be settled before the season has a current gameweek.
  if (!currentGameweek(bootstrap)) {
    return NextResponse.json({ ok: true, skipped: 'pre-season' });
  }

  const revalidate = revalidateFor(bootstrap);
  const standings = await fetchStandings(revalidate);
  const members = resolveMembers(standings);
  const eligibleFrom = eligibleFromByEntry({
    bootstrap,
    members,
    startEvent: standings.league.start_event,
  });

  const { degraded } = await checkAndRecordSettled({ bootstrap, members, eligibleFrom });

  return NextResponse.json({ ok: true, degraded });
}
