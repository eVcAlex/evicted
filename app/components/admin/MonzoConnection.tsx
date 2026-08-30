'use client';

import { useEffect, useState } from 'react';
import { Button, Text } from '@mantine/core';
import type { MonzoStatus } from '@/lib/monzo/store';
import classes from './AdminPanel.module.scss';

/**
 * Connection status, plus the two actions that change it: connect/reconnect
 * via OAuth, and register the webhook once Monzo access is confirmed.
 * Registering re-triggers the status fetch (`registerResult` in the effect's
 * deps) so a successful registration is reflected without a manual refresh.
 */
export function MonzoConnection({ pin }: { pin: string }) {
  const [status, setStatus] = useState<MonzoStatus | 'loading' | 'error' | 'unauthorised' | null>(
    null,
  );
  const [registerResult, setRegisterResult] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);

  useEffect(() => {
    setStatus('loading');
    fetch('/api/monzo/status', { headers: { 'x-admin-pin': pin } })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(setStatus)
      .catch((code) => setStatus(code === 401 ? 'unauthorised' : 'error'));
  }, [pin, registerResult]);

  async function register() {
    setRegistering(true);
    setRegisterResult(null);
    try {
      const res = await fetch('/api/monzo/register-webhook', {
        method: 'POST',
        headers: { 'x-admin-pin': pin },
      });
      const body = await res.json();
      setRegisterResult(res.ok ? 'Registered.' : `Failed: ${body.error}`);
    } catch {
      setRegisterResult('Network error.');
    } finally {
      setRegistering(false);
    }
  }

  return (
    <div className={classes.section}>
      <span className={classes.sectionKicker}>Monzo</span>

      {status === 'loading' && (
        <Text size="sm" c="dimmed" mt="sm">
          Loading…
        </Text>
      )}
      {status === 'error' && (
        <Text size="sm" c="red" mt="sm">
          Could not reach the store.
        </Text>
      )}
      {status === 'unauthorised' && (
        <Text size="sm" c="red" mt="sm">
          Admin PIN not accepted. Check ADMIN_PIN is set on the server and is at least 16 characters,
          then re-enter it.
        </Text>
      )}
      {status && typeof status === 'object' && (
        <div className={classes.statusLine}>
          <span className={`${classes.dot} ${status.connected ? classes.dotOn : classes.dotOff}`} />
          {status.connected
            ? `Connected · token expires ${new Date(status.expiresAt!).toLocaleString()}`
            : 'Not connected'}
          {' · '}
          {status.capturedCount} captured, {status.pendingCount} pending
        </div>
      )}

      <div className={classes.actionRow}>
        <Button
          component="a"
          href={`/api/monzo/auth?pin=${encodeURIComponent(pin)}`}
          variant={typeof status === 'object' && status?.connected ? 'default' : 'filled'}
          size="xs"
        >
          {typeof status === 'object' && status?.connected ? 'Reconnect Monzo' : 'Connect Monzo'}
        </Button>
        <Button onClick={register} loading={registering} variant="default" size="xs">
          Register webhook
        </Button>
      </div>

      {registerResult && (
        <Text size="sm" mt="xs" c={registerResult.startsWith('Registered') ? 'green' : 'red'}>
          {registerResult}
        </Text>
      )}
    </div>
  );
}
