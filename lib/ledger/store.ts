import { redisClient } from '@/lib/redis';

const RESULTS_KEY = 'evicted:results';
const PAID_KEY = 'evicted:paid';
const BUYIN_KEY = 'evicted:buyin';

export interface GameweekResult {
  /** Entry ids of everyone tied at the bottom. */
  losers: number[];
  /** Net score per entry id, kept so the record survives FPL changing its mind. */
  scores: Record<number, number>;
  recordedAt: string;
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

export async function getBuyins(): Promise<Set<number>> {
  const members = await redisClient().smembers(BUYIN_KEY);
  return new Set(members.map(Number));
}

export async function setBuyin(entryId: number, paid: boolean): Promise<void> {
  if (paid) {
    await redisClient().sadd(BUYIN_KEY, String(entryId));
  } else {
    await redisClient().srem(BUYIN_KEY, String(entryId));
  }
}
