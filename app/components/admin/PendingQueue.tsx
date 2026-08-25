'use client';

import { useState } from 'react';
import { Button, Select, Text } from '@mantine/core';
import type { PendingCandidate, PendingMatch } from '@/lib/monzo/store';
import { REASONS } from './reasons';
import classes from './AdminPanel.module.scss';

/** The approval queue for credits the matcher couldn't auto-apply confidently. */
export function PendingQueue({ pin }: { pin: string }) {
  const [pending, setPending] = useState<PendingMatch[] | null>(null);
  const [members, setMembers] = useState<PendingCandidate[]>([]);
  const [selected, setSelected] = useState<Record<string, number | undefined>>({});
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);

  async function load() {
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

  if (pending === null) {
    return (
      <div className={classes.actionRow}>
        <Button onClick={load} variant="default" size="xs">
          View pending matches
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className={classes.queueHeading}>
        <span className={classes.queueLabel}>Pending matches</span>
        {pending.length > 0 && <span className={classes.queueCount}>{pending.length} waiting</span>}
      </div>

      {pending.length === 0 && (
        <Text size="sm" c="dimmed">
          Nothing pending.
        </Text>
      )}

      <div className={classes.queue}>
        {pending.map((entry) => {
          // 'no-match' has no candidates of its own — the admin picks from
          // the full roster instead. 'ambiguous' and 'no-debt' already know
          // who it might be, so offer just those.
          const options = (entry.reason === 'no-match' ? members : entry.candidates).map(
            (candidate) => ({ value: String(candidate.entryId), label: candidate.teamName }),
          );
          const canApprove = entry.reason !== 'no-debt';
          const { detail, tag, tone } = REASONS[entry.reason];

          return (
            <div key={entry.id} className={`${classes.pendingCard} ${tone}`}>
              <div className={classes.pendingTop}>
                <div>
                  <div className={classes.pendingAmount}>£{(entry.amountPence / 100).toFixed(2)}</div>
                  <div className={classes.pendingFrom}>from {entry.counterpartyName}</div>
                </div>
                <span className={`${classes.reasonTag} ${tone}`}>{tag}</span>
              </div>

              <div className={classes.pendingDetail}>
                {detail}
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
  );
}
