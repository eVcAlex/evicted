import { Badge, Card, Group, Stack, Text, Title } from '@mantine/core';
import type { Member } from '@/lib/league/members';
import classes from './PreSeason.module.scss';

export function PreSeason({
  members,
  deadline,
  gameweekName,
}: {
  members: Member[];
  deadline: string | null;
  gameweekName: string | null;
}) {
  return (
    <Stack gap="lg">
      <div>
        <Title order={1} className={classes.title}>
          Evicted
        </Title>
        <Text c="dimmed" size="sm">
          Nobody has been evicted yet. {gameweekName ?? 'The season'} has not been played.
        </Text>
      </div>

      {deadline && (
        <Card withBorder padding="md" className={classes.deadlineCard}>
          <Text size="sm" c="dimmed">
            {gameweekName} deadline
          </Text>
          <Text size="xl" fw={700} className={classes.deadlineValue}>
            {new Date(deadline).toLocaleString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </Card>
      )}

      <Stack gap="xs">
        <Text fw={600} size="sm" tt="uppercase" c="dimmed">
          {members.length} in the league
        </Text>
        {members.map((member) => (
          <Card key={member.entryId} withBorder padding="sm" className={classes.memberCard}>
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Text fw={600}>{member.teamName}</Text>
                <Text size="sm" c="dimmed">
                  {member.managerName}
                </Text>
              </div>
              <Badge variant="light" color="gray">
                &mdash;
              </Badge>
            </Group>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
