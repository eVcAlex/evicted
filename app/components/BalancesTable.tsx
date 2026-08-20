import { Badge, Table, Text } from '@mantine/core';
import type { Balance } from '@/lib/league/balances';
import classes from './BalancesTable.module.scss';

function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function BalancesTable({ balances }: { balances: Balance[] }) {
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
              <Text size="xs" c="dimmed">
                {balance.member.managerName}
              </Text>
            </Table.Td>
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
                <Text fw={700} c="red" className={classes.owed}>
                  {pounds(balance.owedPence)}
                </Text>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
