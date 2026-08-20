import { timingSafeEqual } from 'node:crypto';

/**
 * Compares the supplied PIN against `ADMIN_PIN` without leaking length or
 * content through timing. Returns false rather than throwing when no PIN is
 * configured, so a misconfigured deployment fails closed.
 */
export function checkPin(supplied: string | null): boolean {
  const expected = process.env.ADMIN_PIN;
  if (!expected || !supplied) return false;

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}
