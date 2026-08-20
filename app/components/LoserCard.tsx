import { Alert, Avatar, Badge, Card, Group, Stack, Text, Title } from '@mantine/core';
import { paidKey } from '@/lib/ledger/store';
import type { LoserSummary } from '@/lib/league/summary';
import { AdminToggle } from './AdminToggle';
import classes from './LoserCard.module.scss';

function heading(summary: LoserSummary, undecided: boolean): string {
  if (undecided) return 'Nobody yet';
  return summary.losers.length > 1 ? 'Evicted' : 'Evictee';
}

export function LoserCard({
  summary,
  paid,
  degraded,
}: {
  summary: LoserSummary;
  paid: Set<string>;
  /** The payment store could not be read: state is unknown, never "settled". */
  degraded: boolean;
}) {
  const noScores = summary.losers.length === 0;
  // Nine managers level on zero between the deadline and the first kick-off are
  // not nine losers. Only suppress it while the gameweek is still provisional —
  // a genuine settled tie really does fine everyone.
  const levelSoFar = summary.provisional && summary.allTied;
  const undecided = noScores || levelSoFar;

  return (
    <Stack gap="md">
      <div>
        <Text size="sm" c="dimmed" tt="uppercase" fw={600} className={classes.gameweek}>
          Gameweek {summary.gameweek}
        </Text>
        <Title order={1} className={classes.heading}>
          {heading(summary, undecided)}
        </Title>
      </div>

      {summary.provisional && !noScores && (
        <Alert color="yellow" variant="light" title="Provisional">
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

      {!undecided &&
        summary.losers.map(({ member, score }) => {
          const settled = paid.has(paidKey(summary.gameweek, member.entryId));

          return (
            <Card key={member.entryId} withBorder padding="lg" className={classes.card}>
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" align="flex-start">
                  <Avatar name={member.teamName} color="initials" radius="xl" size="lg" />
                  <div>
                    <Text fw={800} className={classes.teamName}>
                      {member.teamName}
                    </Text>
                    <Text c="dimmed">{member.managerName}</Text>
                  </div>
                </Group>
                <Badge size="lg" color="red" variant="filled" className={classes.score}>
                  {score.net} pts
                </Badge>
              </Group>

              <Group gap="lg" mt="md">
                <Text size="sm" c="dimmed">
                  Gross {score.gross}
                </Text>
                <Text size="sm" c={score.hits > 0 ? 'red' : 'dimmed'}>
                  Hits &minus;{score.hits}
                </Text>
              </Group>

              <Group justify="space-between" mt="md">
                {degraded ? (
                  <Badge color="gray" variant="light">
                    Unknown
                  </Badge>
                ) : (
                  <Badge color={settled ? 'green' : 'red'} variant="light">
                    {settled ? 'Settled' : 'Owes £2'}
                  </Badge>
                )}
                <AdminToggle
                  gameweek={summary.gameweek}
                  entryId={member.entryId}
                  paid={settled}
                />
              </Group>
            </Card>
          );
        })}
    </Stack>
  );
}
