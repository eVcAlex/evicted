'use client';

import { useEffect, useState } from 'react';
import { Alert, Button, Code, Select, Text } from '@mantine/core';
import { PIN_STORAGE_KEY } from '@/lib/adminPinStorage';
import classes from './AdminPanel.module.scss';

interface MonzoStatus {
  connected: boolean;
  expiresAt: string | null;
  capturedCount: number;
  pendingCount: number;
}

interface PendingCandidate {
  entryId: number;
  teamName: string;
}

interface PendingMatch {
  id: string;
  receivedAt: string;
  amountPence: number;
  counterpartyName: string;
  reason: 'ambiguous' | 'no-debt' | 'no-match';
  candidates: PendingCandidate[];
}

function pendingReasonLabel(reason: PendingMatch['reason']): string {
  switch (reason) {
    case 'ambiguous':
      return 'Name matched more than one member';
    case 'no-debt':
      return 'No matching debt owed';
    case 'no-match':
      return "Sender name didn't match any member";
  }
}

function reasonTagLabel(reason: PendingMatch['reason']): string {
  switch (reason) {
    case 'ambiguous':
      return 'Ambiguous';
    case 'no-debt':
      return 'No debt';
    case 'no-match':
      return 'No match';
  }
}

/** The reason encoded as a colour: yellow for a caution worth a careful pick,
 * violet for a decision that needs the admin's judgement, neutral otherwise. */
function reasonToneClass(reason: PendingMatch['reason']): string {
  switch (reason) {
    case 'ambiguous':
      return classes.ambiguous;
    case 'no-debt':
      return classes.noDebt;
    case 'no-match':
      return classes.noMatch;
  }
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
  const [pending, setPending] = useState<PendingMatch[] | null>(null);
  const [members, setMembers] = useState<PendingCandidate[]>([]);
  const [selected, setSelected] = useState<Record<string, number | undefined>>({});
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
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

  async function viewPending() {
    if (!pin) return;
    const [pendingRes, membersRes] = await Promise.all([
      fetch('/api/monzo/pending', { headers: { 'x-admin-pin': pin } }),
      fetch('/api/monzo/members', { headers: { 'x-admin-pin': pin } }),
    ]);
    const pendingBody = await pendingRes.json();
    const membersBody = await membersRes.json();
    setPending(pendingBody.pending ?? []);
    setMembers(membersBody.members ?? []);
  }

  /** One-off: removes the entry, remembers nothing about the sender. */
  async function removePending(id: string) {
    if (!pin) return;
    setDismissing(id);
    try {
      await fetch('/api/monzo/pending', {
        method: 'DELETE',
        headers: { 'x-admin-pin': pin, 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setPending((current) => current?.filter((entry) => entry.id !== id) ?? null);
    } finally {
      setDismissing(null);
    }
  }

  /** Attributes the credit to the chosen member and remembers the sender for next time. */
  async function approvePending(id: string) {
    if (!pin) return;
    const entryId = selected[id];
    if (!entryId) return;
    setApproving(id);
    try {
      const res = await fetch('/api/monzo/pending', {
        method: 'POST',
        headers: { 'x-admin-pin': pin, 'content-type': 'application/json' },
        body: JSON.stringify({ id, entryId }),
      });
      if (res.ok) {
        setPending((current) => current?.filter((entry) => entry.id !== id) ?? null);
      }
    } finally {
      setApproving(null);
    }
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
          fails with a 403 until that confirmation lands — that's expected, just
          retry once you've confirmed.
        </Alert>
      )}

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
          <Button onClick={viewPending} variant="default" size="xs">
            View pending matches
          </Button>
          <Button onClick={viewCaptured} variant="subtle" size="xs">
            View captured payloads
          </Button>
        </div>

        {registerResult && (
          <Text size="sm" mt="xs" c={registerResult.startsWith('Registered') ? 'green' : 'red'}>
            {registerResult}
          </Text>
        )}
      </div>

      {pending && (
        <div>
          <div className={classes.queueHeading}>
            <span className={classes.queueLabel}>Pending matches</span>
            {pending.length > 0 && (
              <span className={classes.queueCount}>{pending.length} waiting</span>
            )}
          </div>

          {pending.length === 0 && (
            <Text size="sm" c="dimmed">
              Nothing pending.
            </Text>
          )}

          <div className={classes.queue}>
            {pending.map((entry) => {
              // 'no-match' has no candidates of its own — the admin picks from
              // the full roster instead. 'ambiguous' and 'no-debt' already
              // know who it might be, so offer just those.
              const options = (entry.reason === 'no-match' ? members : entry.candidates).map(
                (candidate) => ({ value: String(candidate.entryId), label: candidate.teamName }),
              );
              const canApprove = entry.reason !== 'no-debt';
              const tone = reasonToneClass(entry.reason);

              return (
                <div key={entry.id} className={`${classes.pendingCard} ${tone}`}>
                  <div className={classes.pendingTop}>
                    <div>
                      <div className={classes.pendingAmount}>
                        £{(entry.amountPence / 100).toFixed(2)}
                      </div>
                      <div className={classes.pendingFrom}>from {entry.counterpartyName}</div>
                    </div>
                    <span className={`${classes.reasonTag} ${tone}`}>
                      {reasonTagLabel(entry.reason)}
                    </span>
                  </div>

                  <div className={classes.pendingDetail}>
                    {pendingReasonLabel(entry.reason)}
                    {entry.candidates.length > 0
                      ? ` — ${entry.candidates.map((c) => c.teamName).join(', ')}`
                      : ''}
                  </div>

                  <div className={classes.pendingRow}>
                    {canApprove && (
                      <>
                        <Select
                          placeholder="Who is this?"
                          data={options}
                          value={selected[entry.id] != null ? String(selected[entry.id]) : null}
                          onChange={(value) =>
                            setSelected((current) => ({
                              ...current,
                              [entry.id]: value ? Number(value) : undefined,
                            }))
                          }
                          size="xs"
                          className={classes.select}
                        />
                        <Button
                          size="xs"
                          variant="filled"
                          disabled={!selected[entry.id]}
                          loading={approving === entry.id}
                          onClick={() => approvePending(entry.id)}
                        >
                          Approve
                        </Button>
                      </>
                    )}
                    <Button
                      size="xs"
                      variant="subtle"
                      loading={dismissing === entry.id}
                      onClick={() => removePending(entry.id)}
                    >
                      Remove
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {captured && (
        <Code block style={{ maxHeight: 400, overflow: 'auto' }}>
          {JSON.stringify(captured, null, 2)}
        </Code>
      )}
    </div>
  );
}
