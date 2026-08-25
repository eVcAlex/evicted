'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Group, Modal, PasswordInput } from '@mantine/core';
import { PIN_STORAGE_KEY } from '@/lib/adminPinStorage';

export function AdminToggle({
  gameweek,
  entryId,
  paid,
  label,
  variant = 'subtle',
}: {
  gameweek: number;
  entryId: number;
  paid: boolean;
  /** Overrides the default "Mark paid" wording — used per gameweek on balances. */
  label?: string;
  /** "white" reads on the red evictee card; default "subtle" suits a neutral background. */
  variant?: 'subtle' | 'white';
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState(false);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Visible only once this browser already holds an admin PIN (set via
  // /admin, which is deliberately unlinked from the public nav) — the
  // public site shouldn't surface an admin action to every visitor just
  // because the PIN prompt would reject them.
  const [knownAdmin, setKnownAdmin] = useState(false);

  useEffect(() => {
    setKnownAdmin(!!window.localStorage.getItem(PIN_STORAGE_KEY));
  }, []);

  async function submit(candidatePin: string) {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/toggle', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-admin-pin': candidatePin },
        body: JSON.stringify({ gameweek, entryId, paid: !paid }),
      });

      if (response.ok) {
        window.localStorage.setItem(PIN_STORAGE_KEY, candidatePin);
        setOpened(false);
        setPin('');
        router.refresh();
        return;
      }

      // Only 401 means the PIN was wrong. Treating every failure as an auth
      // failure threw away a valid saved PIN whenever the store was down, and
      // told the admin the opposite of what had actually happened.
      if (response.status === 401) {
        window.localStorage.removeItem(PIN_STORAGE_KEY);
        setPin('');
        setError('Rejected. Wrong PIN?');
        setOpened(true);
        return;
      }

      setError(`Could not save that (error ${response.status}). Try again shortly.`);
      setOpened(true);
    } catch {
      setError('Network error. Please try again.');
      setOpened(true);
    } finally {
      setBusy(false);
    }
  }

  function handleClick() {
    const saved = window.localStorage.getItem(PIN_STORAGE_KEY);
    if (saved) {
      submit(saved);
      return;
    }
    setError(null);
    setPin('');
    setOpened(true);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!pin) return;
    submit(pin);
  }

  if (!knownAdmin) return null;

  return (
    <>
      <Button size="xs" variant={variant} loading={busy && !opened} onClick={handleClick}>
        {label ?? `Mark ${paid ? 'unpaid' : 'paid'}`}
      </Button>

      <Modal
        opened={opened}
        onClose={() => !busy && setOpened(false)}
        title="Admin PIN"
        centered
        size="xs"
      >
        <form onSubmit={handleSubmit}>
          <PasswordInput
            label="PIN"
            value={pin}
            onChange={(event) => setPin(event.currentTarget.value)}
            error={error}
            data-autofocus
            autoComplete="off"
          />
          <Group justify="flex-end" mt="md">
            <Button variant="subtle" onClick={() => setOpened(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!pin}>
              Confirm
            </Button>
          </Group>
        </form>
      </Modal>
    </>
  );
}
