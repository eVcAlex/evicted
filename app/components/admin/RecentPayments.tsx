'use client';

import { useState } from 'react';
import { Button, Text } from '@mantine/core';
import type { PaymentLogEntry } from '@/lib/ledger/store';
import type { PendingCandidate } from '@/lib/monzo/store';
import classes from './AdminPanel.module.scss';

function allocationSummary(entry: PaymentLogEntry): string {
  const parts: string[] = [];
  if (entry.allocation.fineGameweeks.length > 0) {
    parts.push(entry.allocation.fineGameweeks.map((gw) => `GW${gw}`).join(', '));
  }
  if (entry.allocation.buyin) parts.push('Buy-in');
  const d = entry.allocation.creditDeltaPence;
  if (d > 0) parts.push(`+ £${(d / 100).toFixed(2)} credit`);
  if (d < 0) parts.push(`− £${(-d / 100).toFixed(2)} credit`);
  return parts.join(' · ') || 'nothing';
}

export function RecentPayments({ pin }: { pin: string }) {
  const [payments, setPayments] = useState<PaymentLogEntry[] | null>(null);
  const [members, setMembers] = useState<PendingCandidate[]>([]);
  const [reversing, setReversing] = useState<string | null>(null);

  async function load() {
    const [payRes, memRes] = await Promise.all([
      fetch('/api/admin/payments', { headers: { 'x-admin-pin': pin } }),
      fetch('/api/monzo/members', { headers: { 'x-admin-pin': pin } }),
    ]);
    setPayments((await payRes.json()).payments ?? []);
    setMembers((await memRes.json()).members ?? []);
  }

  function teamName(entryId: number): string {
    return members.find((m) => m.entryId === entryId)?.teamName ?? `Entry ${entryId}`;
  }

  async function reverse(id: string) {
    setReversing(id);
    try {
      const res = await fetch('/api/admin/reverse-payment', {
        method: 'POST',
        headers: { 'x-admin-pin': pin, 'content-type': 'application/json' },
        body: JSON.stringify({ paymentId: id }),
      });
      if (res.ok) await load();
    } finally {
      setReversing(null);
    }
  }

  if (payments === null) {
    return (
      <div className={classes.actionRow}>
        <Button onClick={load} variant="default" size="xs">
          View recent payments
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className={classes.queueHeading}>
        <span className={classes.queueLabel}>Recent payments</span>
      </div>
      {payments.length === 0 && (
        <Text size="sm" c="dimmed">
          Nothing recorded yet.
        </Text>
      )}
      <div className={classes.queue}>
        {payments.map((entry) => {
          const isMonzo = entry.source === 'monzo';
          return (
            <div
              key={entry.id}
              className={`${classes.pendingCard} ${isMonzo ? '' : classes.chase}`}
            >
              <div className={classes.pendingTop}>
                <div>
                  <div className={classes.pendingAmount}>
                    {entry.amountPence > 0 ? `£${(entry.amountPence / 100).toFixed(2)}` : '—'}
                  </div>
                  <div className={classes.pendingFrom}>
                    {new Date(entry.receivedAt).toLocaleDateString('en-GB')} · {teamName(entry.entryId)}
                  </div>
                </div>
                {isMonzo && (
                  <Button
                    size="xs"
                    variant="subtle"
                    loading={reversing === entry.id}
                    onClick={() => reverse(entry.id)}
                  >
                    Reverse
                  </Button>
                )}
              </div>
              <div className={classes.pendingDetail}>{allocationSummary(entry)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
