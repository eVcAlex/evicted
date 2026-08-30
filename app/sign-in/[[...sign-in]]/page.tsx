import { SignIn } from '@clerk/nextjs';

/**
 * The only unauthenticated entry point to admin. Clerk owns the form; the
 * root layout's Container puts it on the site's dark ground. There is no
 * sign-up route - the Clerk dashboard allowlist admits exactly one address.
 */
export default function SignInPage() {
  return <SignIn />;
}
