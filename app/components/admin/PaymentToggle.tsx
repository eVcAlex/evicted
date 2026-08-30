'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Text } from '@mantine/core';

/**
 * Marks one thing paid or unpaid: a gameweek fine (`/api/admin/toggle`) or the
 * season buy-in (`/api/admin/toggle-buyin`). Rendered only inside `/admin`,
 * which `middleware.ts` gates, so there is no auth prompt here - the session
 * cookie authenticates the POST. On success it refreshes the server component
 * so the row re-renders from fresh data.
 */
export function PaymentToggle({
  endpoint,
  requestBody,
  paid,
  label,
  disabled = false,
}: {
  endpoint: string;
  requestBody: Record<string, unknown>;
  paid: boolean;
  label?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...requestBody, paid: !paid }),
      });

      if (response.ok) {
        router.refresh();
        return;
      }
      // A 401 here means the Clerk session lapsed, not a wrong secret.
      setError(
        response.status === 401
          ? 'Session expired, reload'
          : `Failed (error ${response.status})`,
      );
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <Button
        size="xs"
        variant={paid ? 'subtle' : 'default'}
        loading={busy}
        disabled={disabled}
        onClick={toggle}
      >
        {label ?? (paid ? 'Mark unpaid' : 'Mark paid')}
      </Button>
      {error && (
        <Text size="xs" c="red" mt={4}>
          {error}
        </Text>
      )}
    </span>
  );
}
