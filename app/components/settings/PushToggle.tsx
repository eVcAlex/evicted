'use client';

import { useEffect, useState } from 'react';
import { ActionIcon, Text, Tooltip } from '@mantine/core';
import { deleteSubscription, postSubscription } from '@/lib/push/client';
import { useMe } from '../common/MeProvider';
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

/**
 * A bell toggle for the weekly loser notification. Shows a short reason
 * instead of the bell when the browser has no push support, or
 * `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is unset — a previous version returned
 * `null` here, which made "why isn't this here on my phone" undiagnosable
 * without remote devtools.
 */
export function PushToggle() {
  const [status, setStatus] = useState<Status>('loading');
  const [unsupportedReason, setUnsupportedReason] = useState<string | null>(null);
  const [subscribeError, setSubscribeError] = useState<string | null>(null);
  const { me } = useMe();

  useEffect(() => {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      setUnsupportedReason('No VAPID key configured on this deployment.');
      setStatus('unsupported');
      return;
    }
    if (!('serviceWorker' in navigator)) {
      setUnsupportedReason('This browser has no Service Worker API.');
      setStatus('unsupported');
      return;
    }
    if (!('PushManager' in window)) {
      setUnsupportedReason(
        'This browser has no Push API here. On iOS, only an app opened from an installed Home Screen icon gets one.',
      );
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
      .catch((error: unknown) => {
        if (cancelled) return;
        setUnsupportedReason(
          `Service worker registration failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        setStatus('unsupported');
      });

    return () => {
      cancelled = true;
    };
  }, []);

  async function subscribe() {
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) return;

    setStatus('loading');
    setSubscribeError(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setSubscribeError(
          permission === 'denied'
            ? 'Notification permission was denied. Check this app’s notification settings on your phone.'
            : 'Notification permission prompt was dismissed.',
        );
        setStatus('unsubscribed');
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });
      await postSubscription(subscription.toJSON(), me?.entryId ?? null);
      setStatus('subscribed');
    } catch (error) {
      console.error('push subscribe failed', error);
      setSubscribeError(error instanceof Error ? error.message : 'Subscribe failed.');
      setStatus('unsubscribed');
    }
  }

  async function unsubscribe() {
    setStatus('loading');
    setSubscribeError(null);
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
      setSubscribeError(error instanceof Error ? error.message : 'Unsubscribe failed.');
      setStatus('subscribed');
    }
  }

  if (status === 'unsupported') {
    return (
      <Text size="xs" c="dimmed" className={classes.unsupported}>
        {unsupportedReason ?? 'Push notifications are not available in this browser.'}
      </Text>
    );
  }

  const subscribed = status === 'subscribed';

  return (
    <div className={classes.wrap}>
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

      {subscribeError && (
        <Text size="xs" c="red" className={classes.errorMessage}>
          {subscribeError}
        </Text>
      )}
    </div>
  );
}
