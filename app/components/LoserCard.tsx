import { Alert, Badge, Card, Group, Stack, Text, Title } from '@mantine/core';
import type { LoserSummary } from '@/lib/league/summary';
import classes from './LoserCard.module.scss';

export function LoserCard({ summary }: { summary: LoserSummary }) {
  return (
    <Stack gap="md">
      <div>
        <Text size="sm" c="dimmed" tt="uppercase" fw={600} className={classes.gameweek}>
          Gameweek {summary.gameweek}
        </Text>
        <Title order={1} className={classes.heading}>
          {summary.losers.length > 1 ? 'Evicted' : 'Evictee'}
        </Title>
      </div>

      {summary.provisional && (
        <Alert color="yellow" variant="light" title="Provisional">
          Bonus points and auto-substitutions have not been applied yet. The bottom
          spot can still change.
        </Alert>
      )}

      {summary.losers.map(({ member, score }) => (
        <Card key={member.entryId} withBorder padding="lg" className={classes.card}>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text fw={800} className={classes.teamName}>
                {member.teamName}
              </Text>
              <Text c="dimmed">{member.managerName}</Text>
            </div>
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
        </Card>
      ))}
    </Stack>
  );
}
