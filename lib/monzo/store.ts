import { Redis } from '@upstash/redis';

const TOKEN_KEY = 'evicted:monzo';
const CAPTURE_KEY = 'evicted:monzo:capture';
const SEEN_TX_KEY = 'evicted:monzo:seen';
const PENDING_KEY = 'evicted:monzo:pending';

/** Kept under 100 so the capture phase can't grow the key without bound. */
const MAX_CAPTURED_PAYLOADS = 100;

/** Kept under 50 — this only grows on matches that need a human, which should be rare. */
const MAX_PENDING = 50;

export interface MonzoTokens extends Record<string, string> {
  access_token: string;
  refresh_token: string;
  /** ISO timestamp. Access tokens last 6h; refresh is single-use and rotates. */
  expires_at: string;
}

let client: Redis | null = null;

/**
 * Same reasoning as `lib/ledger/store.ts`: check credentials before
 * constructing the client, so an unconfigured deployment throws immediately
 * instead of retrying an unparseable request for several seconds.
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

export async function saveTokens(tokens: MonzoTokens): Promise<void> {
  await redisClient().hset(TOKEN_KEY, tokens);
}

export async function getTokens(): Promise<MonzoTokens | null> {
  const raw = await redisClient().hgetall<MonzoTokens>(TOKEN_KEY);
  if (!raw || !raw.access_token) return null;
  return raw;
}

export interface CapturedPayload {
  receivedAt: string;
  payload: unknown;
}

/**
 * Capture-phase only. Appends the raw webhook body so the real payload shape
 * can be read back without digging through Vercel logs. Nothing reads this
 * key once the matcher is built from an observed payload — it exists purely
 * to get from "OAuth connected" to "we know what `counterparty` looks like."
 *
 * Pushed as an object, not a JSON string: the Upstash client serialises and
 * deserialises values itself (the same reason `getResults` in
 * `lib/ledger/store.ts` never calls `JSON.parse`). Pre-stringifying here made
 * `lrange` hand back an already-parsed object on read, and re-parsing that
 * threw `"[object Object]" is not valid JSON`.
 */
export async function appendCapturedPayload(payload: unknown): Promise<void> {
  const r = redisClient();
  const entry: CapturedPayload = { receivedAt: new Date().toISOString(), payload };
  await r.lpush(CAPTURE_KEY, entry);
  await r.ltrim(CAPTURE_KEY, 0, MAX_CAPTURED_PAYLOADS - 1);
}

export async function getCapturedPayloads(): Promise<CapturedPayload[]> {
  return redisClient().lrange<CapturedPayload>(CAPTURE_KEY, 0, MAX_CAPTURED_PAYLOADS - 1);
}

/**
 * SADD is atomic, so two near-simultaneous deliveries of the same transaction
 * can't both see "not seen yet" and double-apply a match. Necessary because
 * Monzo redelivers on every state change — six webhooks were observed for one
 * transaction while capturing the real payload shape (category settling,
 * `settled` timestamp landing, etc.), all sharing one `data.id`.
 */
export async function markTransactionSeen(txId: string): Promise<boolean> {
  const added = await redisClient().sadd(SEEN_TX_KEY, txId);
  return added === 1;
}

export interface PendingMatch {
  /** The Monzo transaction id — already unique, so it doubles as this entry's id. */
  id: string;
  receivedAt: string;
  amountPence: number;
  counterpartyName: string;
  reason: 'ambiguous' | 'no-debt';
  /** Team name(s) of the member(s) this could be, for a human to read. */
  candidates: string[];
}

export async function appendPending(entry: PendingMatch): Promise<void> {
  const r = redisClient();
  await r.lpush(PENDING_KEY, entry);
  await r.ltrim(PENDING_KEY, 0, MAX_PENDING - 1);
}

export async function getPending(): Promise<PendingMatch[]> {
  return redisClient().lrange<PendingMatch>(PENDING_KEY, 0, MAX_PENDING - 1);
}

/**
 * Removes one entry once an admin has manually resolved it (via the balances
 * paid toggle) or decided it needs no action. Redis lists have no "remove by
 * field" primitive, so this reads the whole (bounded, ≤50) list, filters out
 * the dismissed id, and rewrites it — simplest correct option at this size.
 */
export async function dismissPending(id: string): Promise<void> {
  const r = redisClient();
  const all = await r.lrange<PendingMatch>(PENDING_KEY, 0, MAX_PENDING - 1);
  const remaining = all.filter((entry) => entry.id !== id);
  await r.del(PENDING_KEY);
  if (remaining.length > 0) {
    await r.rpush(PENDING_KEY, ...remaining);
  }
}
