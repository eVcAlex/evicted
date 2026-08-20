'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Code, Group, Stack, Text } from '@mantine/core';
import { PIN_STORAGE_KEY } from '@/lib/adminPinStorage';

interface MonzoStatus {
  connected: boolean;
  expiresAt: string | null;
  capturedCount: number;
}

/**
 * Everything here is capture-phase tooling for one admin, not the group —
 * see app/admin/page.tsx for why this page has no link pointing at it.
 */
export function AdminPanel() {
  const [pin, setPin] = useState<string | null>(null);
  const [status, setStatus] = useState<MonzoStatus | 'loading' | 'error' | null>(null);
  const [registerResult, setRegisterResult] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [captured, setCaptured] = useState<unknown[] | null>(null);
  const [justConnected, setJustConnected] = useState(false);

  useEffect(() => {
    setPin(window.localStorage.getItem(PIN_STORAGE_KEY));
    setJustConnected(new URLSearchParams(window.location.search).get('monzo') === 'connected');
  }, []);

  useEffect(() => {
    if (!pin) return;
    setStatus('loading');
    fetch('/api/monzo/status', { headers: { 'x-admin-pin': pin } })
      .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
      .then(setStatus)
      .catch(() => setStatus('error'));
  }, [pin, registerResult]);

  function unlock() {
    const entered = window.prompt('Admin PIN');
    if (!entered) return;
    window.localStorage.setItem(PIN_STORAGE_KEY, entered);
    setPin(entered);
  }

  async function register() {
    if (!pin) return;
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

  async function viewCaptured() {
    if (!pin) return;
    const res = await fetch('/api/monzo/captured', { headers: { 'x-admin-pin': pin } });
    const body = await res.json();
    setCaptured(body.payloads ?? []);
  }

  if (!pin) {
    return <Button onClick={unlock}>Enter admin PIN</Button>;
  }

  return (
    <Stack gap="lg">
      {justConnected && (
        <Alert color="green" variant="light" title="Monzo account authorised">
          Now confirm access in your Monzo app if it hasn't prompted already, then
          click Register webhook below. Registering right after this step often
          fails with a 403 until that confirmation lands — that's expected, just
          retry once you've confirmed.
        </Alert>
      )}

      <div>
        <Text fw={500} mb="xs">
          Monzo (capture phase)
        </Text>
        {status === 'loading' && <Text size="sm" c="dimmed">Loading…</Text>}
        {status === 'error' && <Text size="sm" c="red">Could not reach the store.</Text>}
        {status && typeof status === 'object' && (
          <Text size="sm" c="dimmed" mb="sm">
            {status.connected
              ? `Connected. Token expires ${new Date(status.expiresAt!).toLocaleString()}.`
              : 'Not connected.'}{' '}
            {status.capturedCount} payload{status.capturedCount === 1 ? '' : 's'} captured.
          </Text>
        )}

        <Group>
          <Button
            component="a"
            href={`/api/monzo/auth?pin=${encodeURIComponent(pin)}`}
            variant={typeof status === 'object' && status?.connected ? 'subtle' : 'filled'}
          >
            {typeof status === 'object' && status?.connected ? 'Reconnect Monzo' : 'Connect Monzo'}
          </Button>
          <Button onClick={register} loading={registering} variant="outline">
            Register webhook
          </Button>
          <Button onClick={viewCaptured} variant="subtle">
            View captured payloads
          </Button>
        </Group>

        {registerResult && (
          <Text size="sm" mt="xs" c={registerResult.startsWith('Registered') ? 'green' : 'red'}>
            {registerResult}
          </Text>
        )}

        {captured && (
          <Code block mt="md" style={{ maxHeight: 400, overflow: 'auto' }}>
            {JSON.stringify(captured, null, 2)}
          </Code>
        )}
      </div>
    </Stack>
  );
}
