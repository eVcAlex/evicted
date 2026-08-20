'use client';

import { useState } from 'react';
import { Button } from '@mantine/core';

const PIN_STORAGE_KEY = 'evicted-admin-pin';

export function AdminToggle({
  gameweek,
  entryId,
  paid,
  label,
}: {
  gameweek: number;
  entryId: number;
  paid: boolean;
  /** Overrides the default "Mark paid" wording — used per gameweek on balances. */
  label?: string;
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

      // Only 401 means the PIN was wrong. Treating every failure as an auth
      // failure threw away a valid saved PIN whenever the store was down, and
      // told the admin the opposite of what had actually happened.
      if (response.status === 401) {
        window.localStorage.removeItem(PIN_STORAGE_KEY);
        window.alert('Rejected. Wrong PIN?');
        return;
      }

      window.alert(
        `Could not save that (error ${response.status}). Your PIN is fine — try again shortly.`,
      );
    } catch {
      window.alert('Network error. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="xs" variant="subtle" loading={busy} onClick={toggle}>
      {label ?? `Mark ${paid ? 'unpaid' : 'paid'}`}
    </Button>
  );
}
