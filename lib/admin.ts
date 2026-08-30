import { timingSafeEqual } from 'node:crypto';

/**
 * The shortest `ADMIN_PIN` this app will accept.
 *
 * The site is public and `/api/admin/toggle` accepts unlimited POSTs, so the
 * only thing standing between a stranger and the ledger is the secret's search
 * space. `timingSafeEqual` defeats a timing attack; nothing here defeats brute
 * force. A four-digit "PIN" is enumerable in seconds, and the name invites
 * exactly that, so a short secret is refused outright rather than trusted.
 */
const MIN_SECRET_LENGTH = 16;

/**
 * Compares the supplied PIN against `ADMIN_PIN` without leaking length or
 * content through timing. Returns false rather than throwing when no PIN is
 * configured, so a misconfigured deployment fails closed.
 */
export function checkPin(supplied: string | null): boolean {
  const expected = process.env.ADMIN_PIN;
  if (!expected || !supplied) return false;

  if (expected.length < MIN_SECRET_LENGTH) {
    console.error(
      `ADMIN_PIN is ${expected.length} characters; at least ${MIN_SECRET_LENGTH} are required. ` +
        'The admin endpoint is public and unthrottled, so a short secret can be guessed. ' +
        'Admin writes are refused until it is replaced with a long random string.',
    );
    return false;
  }

  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

/**
 * True when a verified Clerk session belongs to an allowlisted admin.
 *
 * `ADMIN_ALLOWLIST` is a comma-separated list of email addresses. Unset or
 * empty denies everyone, so a half-configured deployment fails closed rather
 * than open. The email is compared case-insensitively after trimming, and a
 * non-string `email` claim is treated as absent.
 */
export function isAdmin(claims: { email?: unknown } | null | undefined): boolean {
  const email = typeof claims?.email === 'string' ? claims.email.toLowerCase().trim() : '';
  if (!email) return false;

  const allowed = (process.env.ADMIN_ALLOWLIST ?? '')
    .split(',')
    .map((entry) => entry.toLowerCase().trim())
    .filter(Boolean);

  return allowed.includes(email);
}
