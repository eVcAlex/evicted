import { Stack, Text, Title } from '@mantine/core';

export default function Home() {
  return (
    <Stack gap="sm" ta="center" mt="xl">
      <Title order={1}>Evicted</Title>
      <Text c="dimmed">Who finished bottom this week, and have they paid up.</Text>
    </Stack>
  );
}
