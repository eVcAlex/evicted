import { redisClient } from '@/lib/redis';

const PUSH_KEY = 'evicted:push';

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /**
   * The classic league entry id of whoever owns this device, so `send.ts`
   * can personalise the title when the eviction is theirs. `undefined` on
   * every subscription saved before this field existed, and `null` when the
   * device holder has explicitly not picked who they are — both read as
   * "no personalisation" the same way.
   */
  entryId?: number | null;
}

export async function getSubscriptions(): Promise<PushSubscriptionRecord[]> {
  const raw = await redisClient().hgetall<Record<string, PushSubscriptionRecord>>(PUSH_KEY);
  return raw ? Object.values(raw) : [];
}

export async function saveSubscription(subscription: PushSubscriptionRecord): Promise<void> {
  await redisClient().hset(PUSH_KEY, { [subscription.endpoint]: subscription });
}

/** Called on subscribe (opting out) and after a 404/410 send (stale). */
export async function removeSubscription(endpoint: string): Promise<void> {
  await redisClient().hdel(PUSH_KEY, endpoint);
}
