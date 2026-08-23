import { Alert, Stack, Text, Title } from '@mantine/core';
import { MONZO_ME_URL } from '@/lib/config';
import { paidKey } from '@/lib/ledger/store';
import { quipFor } from '@/lib/league/quips';
import type { LoserSummary } from '@/lib/league/summary';
import { AdminToggle } from './AdminToggle';
import { Avatar } from './Avatar';
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
  const undecidedText = undecided ? undecidedCopy(noScores) : null;

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

          return (
            <div key={member.entryId}>
              <div className={classes.receipt}>
                <div className={classes.receiptHead}>
                  <div className={classes.receiptAvatar}>
                    <Avatar teamName={member.teamName} managerName={member.managerName} size={54} />
                  </div>
                  <div className={classes.receiptTitle}>Evicted</div>
                  <div className={classes.receiptSub}>#EvictionNotice</div>
                </div>

                <div className={classes.dash} />

                <div className={classes.line}>
                  <span>
                    {member.managerName} ({member.teamName})
                  </span>
                  <span />
                </div>
                <div className={classes.line}>
                  <span>Team score</span>
                  <span>{score.gross}</span>
                </div>
                <div className={classes.line}>
                  <span>Hits</span>
                  <span>&minus;{score.hits}</span>
                </div>
                <div className={classes.line}>
                  <span>Bench (unused)</span>
                  <span>{score.bench}</span>
                </div>

                <div className={classes.dash} />

                <div className={classes.lineTotal}>
                  <span>Net pts</span>
                  <span>{score.net}</span>
                </div>
                <div className={classes.lineTotal}>
                  <span>Amount due</span>
                  <span>£2.00</span>
                </div>

                <Text className={classes.quip}>&ldquo;{quip}&rdquo;</Text>

                {degraded ? (
                  <span className={classes.stamp}>Status unknown</span>
                ) : settled ? (
                  <span className={classes.stampPaid}>Paid</span>
                ) : MONZO_ME_URL ? (
                  <a className={classes.stamp} href={MONZO_ME_URL} target="_blank" rel="noopener noreferrer">
                    Pay £2
                  </a>
                ) : (
                  <span className={classes.stamp}>Owes £2</span>
                )}

                <div className={classes.adminRow}>
                  <AdminToggle
                    gameweek={summary.gameweek}
                    entryId={member.entryId}
                    paid={settled}
                    variant="subtle"
                  />
                </div>
              </div>
              <div className={classes.zigzagBottom} />
            </div>
          );
        })}
    </Stack>
  );
}
