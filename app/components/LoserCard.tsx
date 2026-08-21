import { Alert, Stack, Text, Title } from '@mantine/core';
import { MONZO_ME_URL } from '@/lib/config';
import { paidKey } from '@/lib/ledger/store';
import { quipFor } from '@/lib/league/quips';
import type { LoserSummary } from '@/lib/league/summary';
import { AdminToggle } from './AdminToggle';
import { Avatar } from './Avatar';
import classes from './LoserCard.module.scss';

function heading(undecided: boolean): string {
  return undecided ? 'Nobody yet' : 'Evicted';
}

export function LoserCard({
  summary,
  paid,
  degraded,
  previousLosses,
}: {
  summary: LoserSummary;
  paid: Set<string>;
  /** The payment store could not be read: state is unknown, never "settled". */
  degraded: boolean;
  /** Recorded losses per entry id, for quips that reference streak history. */
  previousLosses: Map<number, number[]>;
}) {
  const noScores = summary.losers.length === 0;
  // Nine managers level on zero between the deadline and the first kick-off are
  // not nine losers. Only suppress it while the gameweek is still provisional —
  // a genuine settled tie really does fine everyone.
  const levelSoFar = summary.provisional && summary.allTied;
  const undecided = noScores || levelSoFar;

  return (
    <Stack gap="lg">
      <Text size="sm" c="dimmed" tt="uppercase" fw={600} className={classes.gameweek}>
        Gameweek {summary.gameweek}
      </Text>

      {summary.provisional && !noScores && (
        <Alert color="red" variant="outline" title="Provisional">
          Bonus points and auto-substitutions have not been applied yet. The bottom
          spot can still change.
        </Alert>
      )}

      {noScores && (
        <Alert color="gray" variant="light" title="No scores yet">
          The gameweek has started but nobody has scored a point yet. Come back
          once the first match has kicked off.
        </Alert>
      )}

      {levelSoFar && !noScores && (
        <Alert color="gray" variant="light" title="Everyone is level">
          Every manager is on the same net score so far, so nobody is bottom yet.
        </Alert>
      )}

      {undecided && (
        <Title order={1} className={classes.heading}>
          {heading(undecided)}
        </Title>
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

          return (
            <div key={member.entryId} className={classes.hero}>
              <div className={classes.heroTop}>
                <div>
                  <span className={classes.kicker}>Sent off</span>
                  <Title order={1} className={classes.heroTitle}>
                    Evicted
                  </Title>
                </div>
                <Avatar
                  teamName={member.teamName}
                  managerName={member.managerName}
                  size={112}
                  className={classes.badge}
                />
              </div>

              <div className={classes.teamRow}>
                <Text className={classes.teamName}>{member.teamName}</Text>
                <Text className={classes.managerName}>{member.managerName}</Text>
              </div>

              <div className={classes.scoreRow}>
                <span className={classes.scoreValue}>{score.net}</span>
                <span className={classes.scoreLabel}>net pts</span>
              </div>

              <div className={classes.statsRow}>
                <span>Gross {score.gross}</span>
                <span>Hits &minus;{score.hits}</span>
                <span>Bench {score.bench}</span>
              </div>

              <Text className={classes.quip}>&ldquo;{quip}&rdquo;</Text>

              <div className={classes.heroFooter}>
                {degraded ? (
                  <span className={classes.status}>Unknown</span>
                ) : settled ? (
                  <span className={classes.statusPaid}>Paid</span>
                ) : MONZO_ME_URL ? (
                  <a className={classes.pay} href={MONZO_ME_URL} target="_blank" rel="noopener noreferrer">
                    Pay £2
                  </a>
                ) : (
                  <span className={classes.statusDue}>Owes £2</span>
                )}
                <AdminToggle
                  gameweek={summary.gameweek}
                  entryId={member.entryId}
                  paid={settled}
                  variant="white"
                />
              </div>
            </div>
          );
        })}
    </Stack>
  );
}
