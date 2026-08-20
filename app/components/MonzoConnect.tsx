'use client';

import { useEffect, useState } from 'react';
import { Anchor, Button } from '@mantine/core';
import { PIN_STORAGE_KEY } from '@/lib/adminPinStorage';

/**
 * Capture-phase tooling, not a feature for the group. There is no real login
 * on this site — every write is PIN-gated but publicly visible (spec's
 * deliberate choice for "Mark paid", since the group can already see
 * everything it toggles). "Connect Monzo" is different: it wires up a real
 * bank account and means nothing to the other eight people reading this
 * page, so it stays hidden until the admin PIN is already known on this
 * browser, rather than showing the button to everyone and relying on the
 * PIN prompt alone.
 *
 * That creates a bootstrap problem — the PIN has to become known on a
 * browser somehow. Pre-season, no gameweek has settled, so no "Mark paid"
 * button exists anywhere else to seed it either. The plain "Admin" link
 * below is that one bootstrap: it only saves a PIN to localStorage, no
 * write, so a stranger clicking it and guessing wrong achieves nothing.
 */
export function MonzoConnect() {
  const [pin, setPin] = useState<string | null>(null);

  useEffect(() => {
    setPin(window.localStorage.getItem(PIN_STORAGE_KEY));
  }, []);

  function unlock() {
    const entered = window.prompt('Admin PIN');
    if (!entered) return;
    window.localStorage.setItem(PIN_STORAGE_KEY, entered);
    setPin(entered);
  }

  if (!pin) {
    return (
      <Anchor size="xs" c="dimmed" onClick={unlock} style={{ cursor: 'pointer' }}>
        Admin
      </Anchor>
    );
  }

  return (
    <Button
      size="xs"
      variant="subtle"
      onClick={() => {
        window.location.href = `/api/monzo/auth?pin=${encodeURIComponent(pin)}`;
      }}
    >
      Connect Monzo
    </Button>
  );
}
