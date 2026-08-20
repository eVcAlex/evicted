'use client';

import { Avatar, Badge, Card, Group, Stack, Text } from '@mantine/core';
import type { Balance } from '@/lib/league/balances';
import { AdminToggle } from './AdminToggle';
import classes from './BalancesTable.module.scss';

function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function BalancesTable({
  balances,
  resultsDegraded,
}: {
  balances: Balance[];
  resultsDegraded: boolean;
}) {
  return (
    <Stack gap="sm" className={classes.list}>
      {balances.map((balance) => (
        <Card key={balance.member.entryId} withBorder padding="md" className={classes.row}>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" align="flex-start">
              <Avatar name={balance.member.teamName} color="initials" radius="xl" />
              <div>
                <Text fw={600} size="sm">
                  {balance.member.teamName}
                </Text>
                {balance.departed ? (
                  <Badge color="gray" variant="light" size="xs" mt={2}>
                    No longer in the league
                  </Badge>
                ) : (
                  <Text size="xs" c="dimmed">
                    {balance.member.managerName}
                  </Text>
                )}
              </div>
            </Group>

            {resultsDegraded ? (
              <Badge color="gray" variant="light">
                Unknown
              </Badge>
            ) : balance.owedPence === 0 ? (
              <Badge color="green" variant="light">
                Clear
              </Badge>
            ) : (
              <Text fw={700} c="red" className={classes.owed}>
                {pounds(balance.owedPence)}
              </Text>
            )}
          </Group>

          {!resultsDegraded && (
            <Text size="xs" c="dimmed" mt="xs" className={classes.meta}>
              {balance.lost.length} lost &middot; {pounds(balance.paidPence)} paid
            </Text>
          )}

          {!resultsDegraded && balance.unpaid.length > 0 && (
            <Group gap={6} mt="sm" className={classes.toggles}>
              {balance.unpaid.map((gameweek) => (
                <AdminToggle
                  key={gameweek}
                  gameweek={gameweek}
                  entryId={balance.member.entryId}
                  paid={false}
                  label={`GW${gameweek}`}
                />
              ))}
            </Group>
          )}
        </Card>
      ))}
    </Stack>
  );
}
