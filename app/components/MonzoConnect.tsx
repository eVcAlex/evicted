'use client';

import { Button } from '@mantine/core';
import { PIN_STORAGE_KEY } from '@/lib/adminPinStorage';

/**
 * Capture-phase tooling, not a feature for the group. Navigates (not
 * fetches) to /api/monzo/auth, because the PIN check there has to end in a
 * browser redirect to Monzo's own authorise screen.
 */
export function MonzoConnect() {
  function connect() {
    let pin = window.localStorage.getItem(PIN_STORAGE_KEY);
    if (!pin) {
      pin = window.prompt('Admin PIN');
      if (!pin) return;
    }
    window.location.href = `/api/monzo/auth?pin=${encodeURIComponent(pin)}`;
  }

  return (
    <Button size="xs" variant="subtle" onClick={connect}>
      Connect Monzo
    </Button>
  );
}
