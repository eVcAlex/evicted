'use client';

import { useState } from 'react';
import { Button } from '@mantine/core';

const PIN_STORAGE_KEY = 'evicted-admin-pin';

export function AdminToggle({
  gameweek,
  entryId,
  paid,
}: {
  gameweek: number;
  entryId: number;
  paid: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    let pin = window.localStorage.getItem(PIN_STORAGE_KEY);
    if (!pin) {
      pin = window.prompt('Admin PIN');
      if (!pin) return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/admin/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-pin': pin },
        body: JSON.stringify({ gameweek, entryId, paid: !paid }),
      });

      if (response.ok) {
        window.localStorage.setItem(PIN_STORAGE_KEY, pin);
        window.location.reload();
        return;
      }

      window.localStorage.removeItem(PIN_STORAGE_KEY);
      window.alert('Rejected. Wrong PIN?');
    } catch {
      window.alert('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="xs" variant="subtle" loading={busy} onClick={toggle}>
      Mark {paid ? 'unpaid' : 'paid'}
    </Button>
  );
}
