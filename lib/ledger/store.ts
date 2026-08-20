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
 * Created on first use rather than at import time. `Redis.fromEnv()` throws
 * when the environment variables are absent, which would break `next build`
 * and any test that merely imports this module.
 */
function redisClient(): Redis {
  client ??= Redis.fromEnv();
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
 * Results are written once and never rewritten — a settled gameweek does not
 * change.
 */
export async function saveResult(
  gameweek: number,
  result: GameweekResult,
): Promise<void> {
  await redisClient().hset(RESULTS_KEY, { [String(gameweek)]: result });
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
