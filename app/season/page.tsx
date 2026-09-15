import { Alert, Text, Title } from '@mantine/core';
import { fetchStandings } from '@/lib/fpl/client';
import type { EntryHistory } from '@/lib/fpl/schemas';
import type { Identity } from '@/lib/identity';
import { loadHistories } from '@/lib/league/checkAndRecord';
import { colorForTeam, initialsFor, photoUrlFor } from '@/lib/league/avatar';
import { resolveMembers } from '@/lib/league/members';
import { buildHallOfShame } from '@/lib/league/stats';
import type { ShareCardContent } from '@/lib/shareCard';
import { safeGetResults } from '@/lib/ledger/safe';
import { ShareStatButton } from '../components/season/ShareStatButton';
import { SeasonGrid } from '../components/season/SeasonGrid';
import classes from './page.module.scss';

/**
 * The avatar/manager fields the downloadable PNG (`lib/shareCard.ts`) draws
 * for `LoserCard`'s "bottom of the week" card — same photo-or-initials mark,
 * same manager-name subline. Without these, a Hall of Shame download renders
 * a visibly sparser card than the one it's meant to match: no avatar circle,
 * no manager line under the team name.
 *
 * Skipped for a tie (more than one identity): the mark would only ever be
 * able to picture one of them, misrepresenting a name field that's already
 * listing several team names.
 */
function identityContent(identities: Identity[]): Partial<ShareCardContent> {
  if (identities.length !== 1) return {};
  const [identity] = identities;
  return {
    meta: identity.managerName,
    avatarUrl: photoUrlFor(identity.managerName),
    avatarInitials: initialsFor(identity.teamName),
    avatarColor: colorForTeam(identity.teamName),
  };
}

export const dynamic = 'force-dynamic';

/** Below this many recorded gameweeks, "longest clean run" etc. is noise. */
const MIN_GAMEWEEKS_FOR_STATS = 3;

export default async function SeasonPage() {
  const [standings, { results, degraded }] = await Promise.all([
    fetchStandings(3600),
    safeGetResults(),
  ]);

  const members = resolveMembers(standings);
  const enoughData = results.size >= MIN_GAMEWEEKS_FOR_STATS;

  // Bench detail is not in the ledger, so it needs a per-manager fetch the
  // rest of this page does not. Treat it as a bonus: if it fails, the award is
  // simply dropped and the rest of the hall of shame still renders.
  let histories: Map<number, EntryHistory> | undefined;
  if (enoughData) {
    try {
      histories = await loadHistories(members, 3600);
    } catch {
      histories = undefined;
    }
  }

  const shame = enoughData ? buildHallOfShame({ members, results, histories }) : null;

  return (
    <>
      <Title order={1} className={classes.title} mb="xs">
        Season
      </Title>
      <Text c="dimmed" size="sm" mb="lg">
        Every gameweek, every manager, one glance.
      </Text>

      {degraded && (
        <Alert color="red" variant="outline" title="Season data unavailable" mb="lg">
          Could not reach the results store. The grid below may be missing recent
          gameweeks.
        </Alert>
      )}

      <SeasonGrid members={members} results={results} league="classic" />

      {shame && (
        <div className={classes.shame}>
          <Text fw={600} size="sm" tt="uppercase" c="dimmed" className={classes.shameTitle}>
            Hall of shame
          </Text>

          <div className={classes.cards}>
            {shame.mostEvictions && (
              <ShameCard
                kicker="Most evictions"
                name={shame.mostEvictions.members.map((m) => m.teamName).join(', ')}
                sub="Bottom of the week more than anyone else."
                statValue={String(shame.mostEvictions.count)}
                statLabel={shame.mostEvictions.count === 1 ? 'eviction' : 'evictions'}
                fileName="evicted-most-evictions"
                {...identityContent(shame.mostEvictions.members)}
              />
            )}
            {shame.worst && (
              <ShameCard
                kicker="Worst gameweek"
                name={shame.worst.member.teamName}
                sub={`Gameweek ${shame.worst.gameweek}`}
                statValue={String(shame.worst.net)}
                statLabel="net pts"
                fileName="evicted-worst-gameweek"
                {...identityContent([shame.worst.member])}
              />
            )}
            {shame.longestLosingStreak && (
              <ShameCard
                kicker="Longest losing streak"
                name={shame.longestLosingStreak.member.teamName}
                sub={
                  shame.longestLosingStreak.fromGameweek === shame.longestLosingStreak.toGameweek
                    ? `Gameweek ${shame.longestLosingStreak.fromGameweek}`
                    : `GW ${shame.longestLosingStreak.fromGameweek} to GW ${shame.longestLosingStreak.toGameweek}`
                }
                statValue={String(shame.longestLosingStreak.weeks)}
                statLabel={shame.longestLosingStreak.weeks === 1 ? 'gameweek' : 'gameweeks'}
                fileName="evicted-longest-losing-streak"
                {...identityContent([shame.longestLosingStreak.member])}
              />
            )}
            {shame.worstBenchHaul && (
              <ShameCard
                kicker="Worst benching haul"
                name={shame.worstBenchHaul.member.teamName}
                sub={`Gameweek ${shame.worstBenchHaul.gameweek}`}
                statValue={String(shame.worstBenchHaul.bench)}
                statLabel="pts benched"
                fileName="evicted-worst-benching-haul"
                {...identityContent([shame.worstBenchHaul.member])}
              />
            )}
            {shame.biggestBottler && (
              <ShameCard
                kicker="Biggest bottler"
                name={shame.biggestBottler.member.teamName}
                sub={`GW ${shame.biggestBottler.fromGameweek} to GW ${shame.biggestBottler.toGameweek}`}
                statValue={String(shame.biggestBottler.drop)}
                statLabel="pt drop"
                fileName="evicted-biggest-bottler"
                {...identityContent([shame.biggestBottler.member])}
              />
            )}
            {shame.longestCleanRun && (
              <ShameCard
                kicker="Longest clean run"
                name={shame.longestCleanRun.member.teamName}
                sub="Current active run without finishing bottom."
                statValue={String(shame.longestCleanRun.weeks)}
                statLabel={shame.longestCleanRun.weeks === 1 ? 'gameweek' : 'gameweeks'}
                fileName="evicted-longest-clean-run"
                {...identityContent([shame.longestCleanRun.member])}
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

/**
 * One downloadable Hall of Shame stat, dressed as the same light stats-sheet
 * card as the home page's `LoserCard` — kicker, name and sub in an identity
 * block up top, the one big mono figure in a bordered hero row below. The
 * only thing it drops is that card's payment status tag: a shame stat isn't
 * a fine, so there's no "£2" to settle.
 *
 * The hero row is pushed to the card's bottom edge via `margin-top: auto`
 * rather than following the identity block in normal flow — every card in
 * the grid is stretched to the tallest one, so without that a short card
 * would leave its number floating mid-air while a wrapped two-line name next
 * to it sits flush; pinning keeps every big figure on the same baseline.
 */
function ShameCard(content: ShareCardContent) {
  return (
    <div className={classes.card}>
      <div className={classes.cardHead}>
        <div className={classes.identity}>
          <span className={classes.cardKicker}>{content.kicker}</span>
          <div className={classes.cardName}>{content.name}</div>
          <span className={classes.cardSub}>{content.sub}</span>
        </div>
        <ShareStatButton content={content} />
      </div>
      <div className={classes.heroRow}>
        <span className={classes.statValue}>{content.statValue}</span>
        <span className={classes.statLabel}>{content.statLabel}</span>
      </div>
    </div>
  );
}
