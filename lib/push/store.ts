import { Redis } from '@upstash/redis';

const PUSH_KEY = 'evicted:push';

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

let client: Redis | null = null;

/**
 * Same reasoning as `lib/ledger/store.ts` and `lib/monzo/store.ts`: check
 * credentials before constructing the client, so an unconfigured deployment
 * throws immediately instead of retrying an unparseable request.
 */
function redisClient(): Redis {
  if (client) return client;

  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (!url || !token) {
    throw new Error(
      'Upstash Redis is not configured: set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.',
    );
  }

  client = new Redis({ url, token, retry: { retries: 1, backoff: () => 200 } });
  return client;
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
