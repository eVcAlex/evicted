import { Stack, Text, Title } from '@mantine/core';
import type { GridResult } from '@/lib/gameweekResult';
import { FINE_PENCE, MONZO_ME_URL } from '@/lib/config';
import { pounds } from '@/lib/format';
import { colorForTeam, initialsFor, photoUrlFor } from '@/lib/league/avatar';
import { paidKey } from '@/lib/ledger/store';
import { recentForm } from '@/lib/league/form';
import { quipFor } from '@/lib/league/quips';
import type { LoserSummary } from '@/lib/league/summary';
import { Avatar } from '../common/Avatar';
import { ShareButton } from './ShareButton';
import classes from './LoserCard.module.scss';

function undecidedCopy(noScores: boolean): { kicker: string; sub: string } {
  return noScores
    ? {
        kicker: 'No scores yet',
        sub: 'The gameweek has started but nobody has scored a point yet. Come back once the first match has kicked off.',
      }
    : {
        kicker: 'Everyone level',
        sub: 'Every manager is on the same net score so far, so nobody is bottom yet.',
      };
}

export function LoserCard({
  summary,
  paid,
  degraded,
  previousLosses,
  results,
}: {
  summary: LoserSummary;
  paid: Set<string>;
  /** The payment store could not be read: state is unknown, never "settled". */
  degraded: boolean;
  /** Recorded losses per entry id, for quips that reference streak history. */
  previousLosses: Map<number, number[]>;
  /** The full recorded ledger — feeds the form sparkline's real history. */
  results: Map<number, GridResult>;
}) {
  const noScores = summary.losers.length === 0;
  // Nine managers level on zero between the deadline and the first kick-off are
  // not nine losers. Only suppress it while the gameweek is still provisional —
  // a genuine settled tie really does fine everyone.
  const levelSoFar = summary.provisional && summary.allTied;
  const undecided = noScores || levelSoFar;
  const undecidedText = undecided ? undecidedCopy(noScores) : null;

  return (
    <Stack gap="lg">
      <div className={classes.meta}>
        <div className={classes.metaRow}>
          <Text size="sm" c="dimmed" tt="uppercase" fw={600} className={classes.gameweek}>
            Gameweek {summary.gameweek}
          </Text>
          {summary.provisional && !noScores && (
            <span className={classes.provisionalTag}>Provisional</span>
          )}
        </div>

        {summary.provisional && !noScores && (
          <Text size="xs" c="dimmed" className={classes.provisionalNote}>
            Bonus points and auto-substitutions haven&apos;t been applied yet, so the
            bottom spot can still change.
          </Text>
        )}
      </div>

      {undecidedText && (
        <div className={classes.undecidedHero}>
          <span className={classes.undecidedKicker}>{undecidedText.kicker}</span>
          <Title order={1} className={classes.undecidedTitle}>
            Nobody yet
          </Title>
          <Text className={classes.undecidedSub}>{undecidedText.sub}</Text>
        </div>
      )}

      {!undecided &&
        summary.losers.map(({ member, score }) => {
          const settled = paid.has(paidKey(summary.gameweek, member.entryId));
          const quip = quipFor({
            gameweek: summary.gameweek,
            net: score.net,
            gross: score.gross,
            hits: score.hits,
            bench: score.bench,
            runnerUpNet: summary.runnerUpNet,
            tied: summary.losers.length > 1,
            previousLosses: previousLosses.get(member.entryId) ?? [],
          });

          // Real settled history only, plus this gameweek's own (possibly
          // still-provisional) score tacked on at the end — never invented.
          // Omitted below the chart entirely once there's nothing prior to
          // compare against, rather than drawing a one-bar "trend".
          const priorForm = recentForm(results, member.entryId, summary.gameweek);
          const form = [...priorForm, { gameweek: summary.gameweek, net: score.net }];
          const maxNet = Math.max(...form.map((point) => point.net), 1);

          const margin =
            summary.runnerUpNet !== null ? summary.runnerUpNet - score.net : null;

          const status = degraded
            ? { label: 'Status unknown', tone: classes.statusUnknown }
            : settled
              ? { label: 'Paid', tone: classes.statusPaid }
              : { label: `Owes ${pounds(FINE_PENCE)}`, tone: classes.statusOwed };

          const marginCopy =
            margin === null
              ? null
              : margin === 0
                ? 'Tied with the next-worst score.'
                : `${margin} point${margin === 1 ? '' : 's'} clear of safety.`;

          return (
            <div key={member.entryId} className={classes.entry}>
              <div className={classes.grid}>
                <div className={classes.card}>
                  <div className={classes.head}>
                    <Avatar teamName={member.teamName} managerName={member.managerName} size={48} />
                    <div className={classes.identity}>
                      <span className={classes.kicker}>Bottom of the week</span>
                      <Title order={2} className={classes.team}>
                        {member.teamName}
                      </Title>
                      <span className={classes.manager}>{member.managerName}</span>
                    </div>
                    <ShareButton
                      content={{
                        kicker: 'Bottom of the week',
                        name: member.teamName,
                        sub: `Gameweek ${summary.gameweek}`,
                        meta: member.managerName,
                        quip,
                        note: degraded ? undefined : status.label,
                        avatarUrl: photoUrlFor(member.managerName),
                        avatarInitials: initialsFor(member.teamName),
                        avatarColor: colorForTeam(member.teamName),
                        statValue: String(score.net),
                        statLabel: 'net pts',
                        fileName: `evicted-gw${summary.gameweek}`,
                      }}
                    />
                  </div>

                  <div className={classes.heroRow}>
                    <div className={classes.net}>
                      <span className={classes.netVal}>{score.net}</span>
                      <span className={classes.netLabel}>net pts</span>
                    </div>
                    <span className={status.tone}>{status.label}</span>
                  </div>

                  <div className={classes.metrics}>
                    <div className={classes.metricRow}>
                      <span className={classes.metricKey}>Team score</span>
                      <span className={classes.metricVal}>{score.gross}</span>
                    </div>
                    <div className={classes.metricRow}>
                      <span className={classes.metricKey}>Transfer hits</span>
                      <span className={classes.metricVal}>&minus;{score.hits}</span>
                    </div>
                    <div className={classes.metricRow}>
                      <span className={classes.metricKey}>Bench, unused</span>
                      <span className={classes.metricVal}>{score.bench}</span>
                    </div>
                    {margin !== null && (
                      <div className={classes.metricRow}>
                        <span className={classes.metricKey}>Gap to safety</span>
                        <span className={classes.metricVal}>
                          {margin === 0 ? 'Tied' : margin}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {priorForm.length > 0 && (
                  <div className={classes.formCard}>
                    <span className={classes.formHeading}>
                      Net score &middot; last {form.length} GWs
                    </span>
                    <div className={classes.sparkline}>
                      {form.map((point, index) => (
                        <div key={point.gameweek} className={classes.bar}>
                          <span
                            className={
                              index === form.length - 1 ? classes.barFillNow : classes.barFill
                            }
                            style={{
                              height: `${Math.max(8, Math.round((Math.max(point.net, 0) / maxNet) * 100))}%`,
                            }}
                          />
                          <span className={classes.barLabel}>GW{point.gameweek}</span>
                        </div>
                      ))}
                    </div>
                    {marginCopy && <p className={classes.marginNote}>{marginCopy}</p>}
                  </div>
                )}
              </div>

              <blockquote className={classes.quip}>&ldquo;{quip}&rdquo;</blockquote>

              {degraded ? (
                <span className={classes.ctaUnknown}>Status unknown</span>
              ) : settled ? (
                <span className={classes.ctaPaid}>Paid</span>
              ) : MONZO_ME_URL ? (
                <a className={classes.cta} href={MONZO_ME_URL} target="_blank" rel="noopener noreferrer">
                  Pay {pounds(FINE_PENCE)}
                </a>
              ) : null}
            </div>
          );
        })}
    </Stack>
  );
}
