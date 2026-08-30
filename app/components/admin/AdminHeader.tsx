'use client';

import { Group, Title } from '@mantine/core';
import { UserButton } from '@clerk/nextjs';

/** The /admin page heading, with the sign-out control (Clerk's UserButton). */
export function AdminHeader() {
  return (
    <Group justify="space-between" align="center" mb="lg">
      <Title order={1}>Admin</Title>
      <UserButton />
    </Group>
  );
}
