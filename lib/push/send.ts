import webpush, { WebPushError } from 'web-push';
import { VAPID_PRIVATE_KEY, VAPID_PUBLIC_KEY, VAPID_SUBJECT } from '@/lib/config';
import type { NewlyRecordedGameweek } from '@/lib/league/record';
import { quipFor } from '@/lib/league/quips';
import { getSubscriptions, removeSubscription, type PushSubscriptionRecord } from './store';

export interface NotificationPayload {
  title: string;
  body: string;
}

/** One notification per loser — same one-card-per-loser split as `LoserCard`. */
export function buildNotifications(newlyRecorded: NewlyRecordedGameweek[]): NotificationPayload[] {
  return newlyRecorded.flatMap(({ summary, previousLosses }) =>
    summary.losers.map(({ member, score }) => ({
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

async function sendOne(
  subscription: PushSubscriptionRecord,
  payload: NotificationPayload,
): Promise<void> {
  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload));
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
