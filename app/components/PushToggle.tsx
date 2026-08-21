'use client';

import { useEffect, useState } from 'react';
import { ActionIcon, Tooltip } from '@mantine/core';
import classes from './PushToggle.module.scss';

type Status = 'unsupported' | 'loading' | 'subscribed' | 'unsubscribed';

/** VAPID public keys are URL-safe base64; `pushManager.subscribe` wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(normalized);

  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

async function postSubscription(subscription: PushSubscription): Promise<void> {
  await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
}

async function deleteSubscription(endpoint: string): Promise<void> {
  await fetch('/api/push/subscribe', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ endpoint }),
  });
}

/**
 * A bell toggle for the weekly loser notification. Renders nothing when the
 * browser has no push support, or `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is unset —
 * same "render nothing rather than a broken control" pattern as the Monzo
 * pay link.
 */
export function PushToggle() {
  const [status, setStatus] = useState<Status>('loading');

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }

    let cancelled = false;
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (!cancelled) setStatus(subscription ? 'subscribed' : 'unsubscribed');
      })
      .catch(() => {
        if (!cancelled) setStatus('unsupported');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function subscribe() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return;

    setStatus('loading');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('unsubscribed');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await postSubscription(subscription);
      setStatus('subscribed');
    } catch (error) {
      console.error('push subscribe failed', error);
      setStatus('unsubscribed');
    }
  }

  async function unsubscribe() {
    setStatus('loading');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await deleteSubscription(subscription.endpoint);
        await subscription.unsubscribe();
      }
      setStatus('unsubscribed');
    } catch (error) {
      console.error('push unsubscribe failed', error);
      setStatus('subscribed');
    }
  }

  if (status === 'unsupported') return null;

  const subscribed = status === 'subscribed';

  return (
    <Tooltip label={subscribed ? 'Notifications on' : 'Get notified when someone’s evicted'}>
      <ActionIcon
        variant="subtle"
        size="lg"
        loading={status === 'loading'}
        aria-label={subscribed ? 'Turn off eviction notifications' : 'Turn on eviction notifications'}
        aria-pressed={subscribed}
        onClick={subscribed ? unsubscribe : subscribe}
        className={subscribed ? `${classes.toggle} ${classes.subscribed}` : classes.toggle}
      >
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
          <path
            d="M12 3a6 6 0 0 0-6 6v3.2L4.2 15.6A1 1 0 0 0 5 17.2h14a1 1 0 0 0 .8-1.6L18 12.2V9a6 6 0 0 0-6-6Z"
            fill={subscribed ? 'currentColor' : 'none'}
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path
            d="M9.5 19a2.5 2.5 0 0 0 5 0"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </ActionIcon>
    </Tooltip>
  );
}
