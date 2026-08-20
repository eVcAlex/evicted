import { Redis } from '@upstash/redis';

const TOKEN_KEY = 'evicted:monzo';
const CAPTURE_KEY = 'evicted:monzo:capture';

/** Kept under 100 so the capture phase can't grow the key without bound. */
const MAX_CAPTURED_PAYLOADS = 100;

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
