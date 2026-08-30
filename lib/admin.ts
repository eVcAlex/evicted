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
  if (!email) {
    // A null/undefined claims object is the ordinary signed-out path. A real
    // object with no string `email` means a signed-in caller is being locked
    // out silently - almost always a missing Clerk session-token claim.
    if (claims != null) {
      console.warn(
        'isAdmin: session claims have no string "email"; check the Clerk "Customize session token" claim',
      );
    }
    return false;
  }

  const allowed = (process.env.ADMIN_ALLOWLIST ?? '')
    .split(',')
    .map((entry) => entry.toLowerCase().trim())
    .filter(Boolean);

  return allowed.includes(email);
}
