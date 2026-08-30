'use client';

import { useState } from 'react';
import { Button, Code } from '@mantine/core';
import classes from './AdminPanel.module.scss';

/** Debug-only readback of raw webhook payloads — for seeing what Monzo actually sends. */
export function CapturedPayloads() {
  const [captured, setCaptured] = useState<unknown[] | null>(null);

  async function load() {
    const res = await fetch('/api/monzo/captured');
    const body = await res.json();
    setCaptured(body.payloads ?? []);
  }

  return (
    <div>
      <div className={classes.actionRow}>
        <Button onClick={load} variant="subtle" size="xs">
          View captured payloads
        </Button>
      </div>

      {captured && (
        <Code block style={{ maxHeight: 400, overflow: 'auto' }}>
          {JSON.stringify(captured, null, 2)}
        </Code>
      )}
    </div>
  );
}
