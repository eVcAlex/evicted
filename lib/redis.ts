import { Redis } from '@upstash/redis';

let client: Redis | null = null;

/**
 * Created on first use rather than at import time. Constructing a client
 * requires the environment variables, which are absent during `next build`
 * and in any test that merely imports this module.
 *
 * Credentials are checked here rather than left to the SDK. A client built
 * without a URL does not fail fast: it retries the unparseable request on the
 * SDK's default backoff and takes **4.3 seconds** to give up, and every page
 * load pays that in full before rendering. Throwing immediately turns the
 * unconfigured case into the instant degraded render it should always have
 * been.
 *
 * `retry` is capped for the configured case for the same reason. The default
 * policy spends multiple seconds on a store that is genuinely down, and this
 * runs on a page nine people refresh at once on a Saturday evening. One quick
 * retry absorbs a blip; anything worse should degrade rather than hang.
 *
 * Shared by every store (`lib/ledger`, `lib/monzo`, `lib/push`) — they all
 * talk to the same Upstash instance, just different keys, so there is one
 * client and one cache rather than one per store.
 */
export function redisClient(): Redis {
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
