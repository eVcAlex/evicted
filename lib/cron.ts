import { timingSafeEqual } from 'node:crypto';

/**
 * Compares the supplied header against `CRON_SECRET` without leaking length
 * or content through timing — same technique as `checkPin` in `admin.ts`.
 * Returns false rather than throwing when no secret is configured, so a
 * misconfigured deployment fails closed instead of accepting every request.
 */
export function checkCronSecret(supplied: string | null): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected || !supplied) return false;

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
