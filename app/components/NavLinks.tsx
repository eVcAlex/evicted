'use client';

import Link from 'next/link';
import { Group, Anchor } from '@mantine/core';

export function NavLinks() {
  return (
    <Group gap="md" mb="lg">
      <Anchor component={Link} href="/" size="sm">
        This week
      </Anchor>
      <Anchor component={Link} href="/balances" size="sm">
        Balances
      </Anchor>
    </Group>
  );
}
