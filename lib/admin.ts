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
