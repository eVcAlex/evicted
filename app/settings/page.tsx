import { Alert, Text, Title } from '@mantine/core';
import { fetchDraftGame, fetchDraftLeague } from '@/lib/draft/client';
import { REVALIDATE_LIVE, revalidateForGame } from '@/lib/draft/gameweeks';
import { resolveDraftMembers } from '@/lib/draft/members';
import { fetchStandings } from '@/lib/fpl/client';
import { resolveMembers, type Member } from '@/lib/league/members';
import { normalizeName } from '@/lib/monzo/matcher';
import { IdentityPicker, type RosterEntry } from '../components/settings/IdentityPicker';
import { PushToggle } from '../components/settings/PushToggle';
import classes from './page.module.scss';

export const dynamic = 'force-dynamic';

async function loadClassicRoster(): Promise<{ members: Member[]; degraded: boolean }> {
  try {
    const standings = await fetchStandings(3600);
    return { members: resolveMembers(standings), degraded: false };
  } catch (error) {
    console.error('settings: could not load the classic roster', error);
    return { members: [], degraded: true };
  }
}

async function loadDraftRoster(): Promise<{ draftEntryByName: Map<string, number>; degraded: boolean }> {
  try {
    const game = await fetchDraftGame(REVALIDATE_LIVE);
    const details = await fetchDraftLeague(revalidateForGame(game));
    const byName = new Map<string, number>();
    for (const member of resolveDraftMembers(details)) {
      // Skip the synthetic "AVERAGE" benchmark entry — it has no human behind it.
      if (member.teamId === null) continue;
      byName.set(normalizeName(member.managerName), member.entryId);
    }
    return { draftEntryByName: byName, degraded: false };
  } catch (error) {
    console.error('settings: could not load the draft roster', error);
    return { draftEntryByName: new Map(), degraded: true };
  }
}

/**
 * Classic and draft each report their own id for the same human — see
 * `lib/draft/members.ts` — so the roster shown here joins the two league
 * rosters on manager name once, at pick time, rather than asking every
 * consumer to re-derive the join.
 */
function buildRoster(classicMembers: Member[], draftEntryByName: Map<string, number>): RosterEntry[] {
  return classicMembers.map((member) => ({
    entryId: member.entryId,
    draftEntryId: draftEntryByName.get(normalizeName(member.managerName)) ?? null,
    managerName: member.managerName,
    teamName: member.teamName,
  }));
}

export default async function SettingsPage() {
  const [classic, draft] = await Promise.all([loadClassicRoster(), loadDraftRoster()]);
  const roster = buildRoster(classic.members, draft.draftEntryByName);

  return (
    <>
      <Title order={1} className={classes.title} mb="xs">
        Settings
      </Title>
      <Text c="dimmed" size="sm" mb="lg">
        Pick who you are on this device, and choose whether to get notified.
      </Text>

      {classic.degraded && (
        <Alert color="red" variant="outline" title="Roster unavailable" mb="lg">
          Could not reach the FPL standings — nobody can be picked right now. Try
          again shortly.
        </Alert>
      )}
      {!classic.degraded && draft.degraded && (
        <Alert color="yellow" variant="outline" title="Draft roster unavailable" mb="lg">
          Could not reach the draft league — picking still highlights the classic
          screens, just not the draft ones, until this loads.
        </Alert>
      )}

      <div className={classes.section}>
        <span className={classes.sectionKicker}>Who are you</span>
        <IdentityPicker roster={roster} />
      </div>

      <div className={classes.section}>
        <span className={classes.sectionKicker}>Notifications</span>
        <div className={classes.notificationRow}>
          <div>
            <Text size="sm" fw={600}>
              Eviction alerts
            </Text>
            <Text size="xs" c="dimmed">
              Get a push notification when someone's evicted.
            </Text>
          </div>
          <PushToggle />
        </div>
      </div>
    </>
  );
}
