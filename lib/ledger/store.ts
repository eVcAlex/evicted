import { Redis } from '@upstash/redis';

const RESULTS_KEY = 'evicted:results';
const PAID_KEY = 'evicted:paid';

export interface GameweekResult {
  /** Entry ids of everyone tied at the bottom. */
  losers: number[];
  /** Net score per entry id, kept so the record survives FPL changing its mind. */
  scores: Record<number, number>;
  recordedAt: string;
}

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

export function paidKey(gameweek: number, entryId: number): string {
  return `${gameweek}:${entryId}`;
}

export async function getResults(): Promise<Map<number, GameweekResult>> {
  const raw = await redisClient().hgetall<Record<string, GameweekResult>>(RESULTS_KEY);
  if (!raw) return new Map();
  return new Map(Object.entries(raw).map(([gw, result]) => [Number(gw), result]));
}

/**
 * Records a gameweek's result, refusing to overwrite one that already exists.
 *
 * A settled gameweek does not change, and rewriting one would alter who owes
 * money after the fact. Correcting a genuinely wrong result is a deliberate
 * manual operation against the store, not something a page load can do.
 *
 * @returns true if written, false if a result for this gameweek already existed
 */
export async function saveResult(
  gameweek: number,
  result: GameweekResult,
): Promise<boolean> {
  const written = await redisClient().hsetnx(RESULTS_KEY, String(gameweek), result);
  return written === 1;
}

export async function getPaid(): Promise<Set<string>> {
  const members = await redisClient().smembers(PAID_KEY);
  return new Set(members);
}

export async function setPaid(
  gameweek: number,
  entryId: number,
  paid: boolean,
): Promise<void> {
  const key = paidKey(gameweek, entryId);
  if (paid) {
    await redisClient().sadd(PAID_KEY, key);
  } else {
    await redisClient().srem(PAID_KEY, key);
  }
}
