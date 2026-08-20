'use client';

import { Alert, Button, Container, Stack } from '@mantine/core';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container size="sm" py="xl">
      <Stack>
        <Alert color="red" title="Could not load the league">
          The Fantasy Premier League API did not respond as expected. This usually
          clears on its own during a busy gameweek.
        </Alert>
        <Button onClick={reset} variant="light">
          Try again
        </Button>
      </Stack>
    </Container>
  );
}
