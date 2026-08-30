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

const CREDIT_KEY = 'evicted:credit';
const PAYMENTS_KEY = 'evicted:payments';

/** Bounded like the Monzo capture log — this only grows on real payments. */
const MAX_PAYMENTS = 200;

export async function getCredit(): Promise<Map<number, number>> {
  const raw = await redisClient().hgetall<Record<string, number>>(CREDIT_KEY);
  if (!raw) return new Map();
  return new Map(Object.entries(raw).map(([id, pence]) => [Number(id), Number(pence)]));
}

/** Absolute set, not a delta — callers compute the new balance. */
export async function setCredit(entryId: number, pence: number): Promise<void> {
  await redisClient().hset(CREDIT_KEY, { [entryId]: pence });
}

export interface PaymentLogEntry {
  /** Monzo txId for webhook payments; `chase:<uuid>`, `reversal:<uuid>` or
   *  `reversed:<originalId>` for entries the app creates itself. */
  id: string;
  entryId: number;
  amountPence: number;
  source: 'monzo' | 'credit-chase' | 'reversal';
  receivedAt: string;
  allocation: {
    fineGameweeks: number[];
    buyin: boolean;
    creditDeltaPence: number;
  };
}

/**
 * Append-only audit + reversal trail. Not authoritative — `evicted:paid` /
 * `evicted:buyin` / `evicted:credit` are. Pushed as an object, not a JSON
 * string: the Upstash client serialises values itself (same as the Monzo
 * capture log).
 */
export async function appendPayment(entry: PaymentLogEntry): Promise<void> {
  const r = redisClient();
  await r.lpush(PAYMENTS_KEY, entry);
  await r.ltrim(PAYMENTS_KEY, 0, MAX_PAYMENTS - 1);
}

export async function getPayments(): Promise<PaymentLogEntry[]> {
  return redisClient().lrange<PaymentLogEntry>(PAYMENTS_KEY, 0, MAX_PAYMENTS - 1);
}
