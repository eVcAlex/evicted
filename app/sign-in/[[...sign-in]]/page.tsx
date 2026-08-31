import { SignIn } from '@clerk/nextjs';

/**
 * The only unauthenticated entry point to admin. Clerk owns the form; the
 * root layout's Container puts it on the site's dark ground. There is no
 * sign-up route: the Clerk instance is invite-only. Having a Clerk session is
 * not enough on its own - `ADMIN_ALLOWLIST` (checked by `isAdmin` in
 * `lib/admin.ts`, enforced in `middleware.ts` and `withAdminAuth`) is what
 * actually admits an address.
 */
export default function SignInPage() {
  return <SignIn />;
}
