'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@mantine/core';
import { CapturedPayloads } from './CapturedPayloads';
import { MonzoConnection } from './MonzoConnection';
import { PendingQueue } from './PendingQueue';
import { RecentPayments } from './RecentPayments';
import classes from './AdminPanel.module.scss';

/**
 * Capture-phase tooling for the one admin. The page this renders on is gated
 * by `middleware.ts`, so this component can assume it is only ever shown to a
 * signed-in admin - it owns only the post-OAuth banner now.
 */
export function AdminPanel() {
  const [justConnected, setJustConnected] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('monzo') === 'connected') {
      setJustConnected(true);
      url.searchParams.delete('monzo');
      window.history.replaceState({}, '', url);
    }
  }, []);

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

      <MonzoConnection />
      <PendingQueue />
      <RecentPayments />
      <CapturedPayloads />
    </div>
  );
}
