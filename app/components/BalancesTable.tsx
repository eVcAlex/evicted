'use client';

import { Badge, Group, Stack, Table, Text } from '@mantine/core';
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
    <Table striped highlightOnHover className={classes.table}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th className={classes.manager}>Manager</Table.Th>
          <Table.Th ta="right">Lost</Table.Th>
          <Table.Th ta="right">Paid</Table.Th>
          <Table.Th ta="right">Owes</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {balances.map((balance) => (
          <Table.Tr key={balance.member.entryId}>
            <Table.Td>
              <Text fw={600} size="sm">
                {balance.member.teamName}
              </Text>
              {balance.departed ? (
                <Badge color="gray" variant="light" size="xs">
                  No longer in the league
                </Badge>
              ) : (
                <Text size="xs" c="dimmed">
                  {balance.member.managerName}
                </Text>
              )}
            </Table.Td>
            {resultsDegraded ? (
              <>
                <Table.Td ta="right">
                  <Text size="sm" c="dimmed">
                    &mdash;
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Text size="sm" c="dimmed">
                    &mdash;
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  <Badge color="gray" variant="light">
                    Unknown
                  </Badge>
                </Table.Td>
              </>
            ) : (
              <>
                <Table.Td ta="right">{balance.lost.length}</Table.Td>
                <Table.Td ta="right">
                  <Text size="sm" c="dimmed">
                    {pounds(balance.paidPence)}
                  </Text>
                </Table.Td>
                <Table.Td ta="right">
                  {balance.owedPence === 0 ? (
                    <Badge color="green" variant="light">
                      Clear
                    </Badge>
                  ) : (
                    <Stack gap={4} align="flex-end">
                      <Text fw={700} c="red" className={classes.owed}>
                        {pounds(balance.owedPence)}
                      </Text>
                      {/* One toggle per unpaid gameweek: this is the view that
                          supports settling a whole season at once, and the
                          gameweek card only ever offers the current gameweek. */}
                      <Group gap={4} justify="flex-end" className={classes.toggles}>
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
                    </Stack>
                  )}
                </Table.Td>
              </>
            )}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
