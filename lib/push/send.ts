import webpush, { WebPushError } from 'web-push';
import { FINE_PENCE, VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '@/lib/config';
import { pounds } from '@/lib/format';
import type { NewlyRecordedGameweek } from '@/lib/league/record';
import { quipFor } from '@/lib/league/quips';
import { getSubscriptions, removeSubscription, type PushSubscriptionRecord } from './store';

export interface NotificationPayload {
  /** The loser's classic entry id — used to personalise the title per
   * recipient, never serialised onto the wire itself (see `sendOne`). */
  entryId: number;
  title: string;
  body: string;
}

/** One notification per loser — same one-card-per-loser split as `LoserCard`. */
export function buildNotifications(newlyRecorded: NewlyRecordedGameweek[]): NotificationPayload[] {
  return newlyRecorded.flatMap(({ summary, previousLosses }) =>
    summary.losers.map(({ member, score }) => ({
      entryId: member.entryId,
      title: `Evicted: ${member.teamName}`,
      body: quipFor({
        gameweek: summary.gameweek,
        net: score.net,
        gross: score.gross,
        hits: score.hits,
        bench: score.bench,
        runnerUpNet: summary.runnerUpNet,
        tied: summary.losers.length > 1,
        previousLosses: previousLosses.get(member.entryId) ?? [],
      }),
    })),
  );
}

/**
 * Broadcast is unchanged — every subscription still gets every notification.
 * Only the title changes, and only for the device that belongs to the
 * person it's about.
 */
function personaliseFor(
  payload: NotificationPayload,
  subscription: PushSubscriptionRecord,
): { title: string; body: string } {
  if (subscription.entryId !== payload.entryId) {
    return { title: payload.title, body: payload.body };
  }
  return { title: `You're evicted: ${pounds(FINE_PENCE)}`, body: payload.body };
}

async function sendOne(
  subscription: PushSubscriptionRecord,
  payload: NotificationPayload,
): Promise<void> {
  try {
    // Only { title, body } goes over the wire — `public/sw.js` reads
    // nothing else, and the internal entryId shouldn't leak into the
    // payload a browser devtools panel could inspect.
    await webpush.sendNotification(subscription, JSON.stringify(personaliseFor(payload, subscription)));
  } catch (error) {
    // Gone/not found: the browser dropped the subscription (uninstalled,
    // permission revoked, storage cleared). It will never succeed again, so
    // clean it up rather than retrying it forever on every future gameweek.
    if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
      await removeSubscription(subscription.endpoint).catch((cleanupError) =>
        console.error('removeSubscription failed', cleanupError),
      );
      return;
    }
    console.error('sendNotification failed', error);
  }
}

/**
 * Pushes a notification for every newly-recorded gameweek to every
 * subscribed device. Fire-and-forget from the caller's perspective — one
 * subscription failing does not stop the others, and this never throws.
 */
export async function notifyLosers(newlyRecorded: NewlyRecordedGameweek[]): Promise<void> {
  if (newlyRecorded.length === 0) return;
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY || !VAPID_SUBJECT) return;

  const notifications = buildNotifications(newlyRecorded);
  if (notifications.length === 0) return;

  let subscriptions: PushSubscriptionRecord[];
  try {
    subscriptions = await getSubscriptions();
  } catch (error) {
    console.error('notifyLosers: could not load subscriptions', error);
    return;
  }
  if (subscriptions.length === 0) return;

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

  await Promise.all(
    notifications.flatMap((payload) =>
      subscriptions.map((subscription) => sendOne(subscription, payload)),
    ),
  );
}
