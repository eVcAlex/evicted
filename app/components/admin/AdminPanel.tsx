'use client';

import { useEffect, useState } from 'react';
import { Alert, Button } from '@mantine/core';
import { PIN_STORAGE_KEY } from '@/lib/adminPinStorage';
import { CapturedPayloads } from './CapturedPayloads';
import { MonzoConnection } from './MonzoConnection';
import { PendingQueue } from './PendingQueue';
import { RecentPayments } from './RecentPayments';
import classes from './AdminPanel.module.scss';

/**
 * Everything here is capture-phase tooling for one admin, not the group —
 * see app/admin/page.tsx for why this page has no link pointing at it.
 *
 * This shell owns only the PIN unlock and the post-OAuth banner; connection
 * status, the pending queue, and the captured-payload viewer are each their
 * own component below, so each can be read (and changed) on its own.
 */
export function AdminPanel() {
  const [pin, setPin] = useState<string | null>(null);
  const [justConnected, setJustConnected] = useState(false);

  useEffect(() => {
    setPin(window.localStorage.getItem(PIN_STORAGE_KEY));

    const url = new URL(window.location.href);
    if (url.searchParams.get('monzo') === 'connected') {
      setJustConnected(true);
      // Strip the param so refreshing or bookmarking this URL doesn't re-show
      // the banner forever — it's a one-time "you just did this" notice set
      // by the OAuth callback's redirect, not an ongoing connection state.
      url.searchParams.delete('monzo');
      window.history.replaceState({}, '', url);
    }
  }, []);

  function unlock() {
    const entered = window.prompt('Admin PIN');
    if (!entered) return;
    window.localStorage.setItem(PIN_STORAGE_KEY, entered);
    setPin(entered);
  }

  if (!pin) {
    return <Button onClick={unlock}>Enter admin PIN</Button>;
  }

  return (
    <div className={classes.stack}>
      {justConnected && (
        <Alert color="green" variant="light" title="Monzo account authorised">
          Now confirm access in your Monzo app if it hasn't prompted already, then
          click Register webhook below. Registering right after this step often
          fails with a 403 until that confirmation lands. That's expected, just
          retry once you've confirmed.
        </Alert>
      )}

      <MonzoConnection pin={pin} />
      <PendingQueue pin={pin} />
      <RecentPayments pin={pin} />
      <CapturedPayloads pin={pin} />
    </div>
  );
}
