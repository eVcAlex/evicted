# Admin login with Clerk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `ADMIN_PIN` header check with a real Clerk login that gates `/admin` at the edge, and move every admin action off the public pages into `/admin`.

**Architecture:** Clerk (Vercel Marketplace) provides hosted sign-in. A root `middleware.ts` runs `clerkMiddleware` and blocks `/admin` (redirect to `/sign-in`) and the admin API routes (401) for anyone who is not a signed-in, allowlisted admin. `withAdminAuth` keeps its signature but swaps its body from `checkPin` to a Clerk `auth()` + `isAdmin()` check, so no route file changes. The client stops sending `x-admin-pin`; the session cookie authenticates automatically. `/admin` becomes a server component that loads league balances and renders a new `MarkPayments` table, replacing the inline `AdminToggle` buttons that are deleted from `/` and `/balances`.

**Tech Stack:** Next.js 16.3 App Router, React 19, Mantine 9, `@clerk/nextjs` v7 (Core 3), Vitest, Upstash Redis.

**Spec:** `docs/superpowers/specs/2026-08-30-admin-auth-clerk-design.md`

## Global Constraints

- **Node >= 20.9** — Clerk Core 3 requirement. Local is 24.14.1, Vercel default 24. OK.
- **Next.js `16.3.1`** — use `middleware.ts` at repo root (not `proxy.ts`); Clerk Core 3 docs target `middleware.ts`.
- **`@clerk/nextjs` v7** — `auth()` is async (`const { userId } = await auth()`), `clerkMiddleware()` not `authMiddleware()`, import types from SDK subpaths not `@clerk/types`.
- **Path alias:** `@/` maps to repo root (e.g. `@/lib/admin`).
- **Package manager:** `pnpm`. Scripts: `pnpm dev`, `pnpm build` (also the type-check gate — there is no standalone `tsc` script), `pnpm lint` (`oxlint lib app`), `pnpm test` (`vitest run`).
- **Vitest** only discovers `lib/**/*.test.ts` (see `vitest.config.ts`), environment `node`. Component/middleware/route-integration tests are out; those get manual verification steps.
- **401 body contract:** admin API auth failures must return exactly `{ "error": "unauthorised" }` with status 401. Clients branch on `response.status === 401`.
- **No em dashes** in any copy, comment, commit message, or doc. (User rule.)
- **Deploy:** `git push` to `main` is a Vercel prod deploy. This plan lands entirely on the branch `feat/admin-auth-clerk`; nothing reaches prod until the branch merges. `ADMIN_PIN` stays set on Vercel until after production verification (Task 8).
- **Single admin:** `alexander.mcguiness@gmail.com`. `ADMIN_ALLOWLIST` is a list but every entry is a full admin; no roles.

---

## File Structure

**Created:**
- `middleware.ts` — the edge gate. Route matchers + Clerk check + `isAdmin` enforcement.
- `app/sign-in/[[...sign-in]]/page.tsx` — Clerk `<SignIn />` catch-all route.
- `app/components/admin/AdminHeader.tsx` — client: the `Admin` title + `<UserButton />` (sign-out).
- `app/components/admin/MarkPayments.tsx` — server: the fines / buy-in marking table.
- `app/components/admin/MarkPayments.module.scss` — styles for the table.
- `app/components/admin/PaymentToggle.tsx` — client: one mark-paid/unpaid button (the stripped `AdminToggle`).
- `lib/api/guards.test.ts` — unit tests for the new `withAdminAuth`.

**Modified:**
- `lib/admin.ts` — remove `checkPin` / `MIN_SECRET_LENGTH`, add `isAdmin`.
- `lib/admin.test.ts` — replace the `checkPin` suite with an `isAdmin` suite.
- `lib/api/guards.ts` — `withAdminAuth` body swaps to Clerk.
- `lib/cron.ts` — comment no longer references `checkPin`.
- `app/layout.tsx` — wrap body in `<ClerkProvider>`.
- `app/admin/page.tsx` — becomes an async server component that loads balances.
- `app/components/admin/AdminPanel.tsx` — drop PIN unlock + `pin` prop threading.
- `app/components/admin/MonzoConnection.tsx` — drop `pin`; `/api/monzo/auth` link loses `?pin=`.
- `app/components/admin/PendingQueue.tsx` — drop `pin` + `x-admin-pin`.
- `app/components/admin/RecentPayments.tsx` — drop `pin` + `x-admin-pin`.
- `app/components/admin/CapturedPayloads.tsx` — drop `pin` + `x-admin-pin`.
- `app/api/monzo/auth/route.ts` — drop `?pin=` read, use `auth()` + `isAdmin()`.
- `app/components/home/LoserCard.tsx` — remove the `AdminToggle` / `.adminRow` block.
- `app/components/balances/BalancesTable.tsx` — remove the `AdminToggle` / `.toggles` block.
- `.env.example` — drop `ADMIN_PIN`, add Clerk + `ADMIN_ALLOWLIST` vars.
- `next.config.ts` — reword the `Referrer-Policy` comment (drop the `?pin=` paragraph).
- `README.md` — reword the "admin PIN protects only writes" line.
- `CONTEXT.md` — add a one-line "Admin auth" note.

**Deleted:**
- `lib/adminPinStorage.ts` — the `PIN_STORAGE_KEY` constant.
- `app/components/common/AdminToggle.tsx` — replaced by `app/components/admin/PaymentToggle.tsx`.

---

## Task 1: Provision Clerk, install the SDK, wire the provider and sign-in page

**Files:**
- Create: `app/sign-in/[[...sign-in]]/page.tsx`
- Modify: `app/layout.tsx`, `.env.example`
- Modify: `package.json` / `pnpm-lock.yaml` (via `pnpm add`)

**Interfaces:**
- Consumes: nothing.
- Produces: `<ClerkProvider>` in the tree, `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `NEXT_PUBLIC_CLERK_SIGN_IN_URL` env vars, a working `/sign-in` route. Clerk's `auth()` / `clerkMiddleware()` / `<UserButton />` become available to later tasks.

- [ ] **Step 1: Human provisions Clerk via the Vercel Marketplace**

This is a dashboard step (no Vercel CLI installed, and the project deploys by `git push`). The implementer pauses here and asks the human to do all of the following, then confirm:

1. Open <https://vercel.com/marketplace/clerk>, **Add Integration**, connect it to the `evicted` project. This auto-creates a Clerk app and sets `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` on all environments of the Vercel project.
2. In the **Clerk dashboard** for that app:
   - **User & Authentication → Email, phone, username:** enable **Email address**. **User & Authentication → Social connections:** enable **Google**.
   - **User & Authentication → Restrictions:** turn on **Restrict sign-ups**, switch mode to **Allowlist**, add `alexander.mcguiness@gmail.com`. Enable **Block sign-ups from email addresses not in the allowlist**.
   - **Sessions → Customize session token → Claims:** add
     ```json
     { "email": "{{user.primary_email_address}}" }
     ```
     (this puts the verified email in `sessionClaims.email`, which `isAdmin` reads in both middleware and route handlers with no extra API call).
   - **Users → Create user:** create `alexander.mcguiness@gmail.com` (or plan to sign up once through the deployed app; the allowlist permits exactly this address).
   - **API keys:** copy the **Publishable key** and **Secret key**.
3. Paste into local `.env.local` (create if missing):
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   ADMIN_ALLOWLIST=alexander.mcguiness@gmail.com
   ```
4. On Vercel, add `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in` and `ADMIN_ALLOWLIST=alexander.mcguiness@gmail.com` to the project env vars (all environments). Leave `ADMIN_PIN` in place for now.

- [ ] **Step 2: Install the SDK**

```bash
pnpm add @clerk/nextjs
```

Expected: `@clerk/nextjs` at `^7` (Core 3) appears in `package.json` dependencies.

- [ ] **Step 3: Add the sign-in route**

Create `app/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from '@clerk/nextjs';

/**
 * The only unauthenticated entry point to admin. Clerk owns the form; the
 * root layout's Container puts it on the site's dark ground. There is no
 * sign-up route - the Clerk dashboard allowlist admits exactly one address.
 */
export default function SignInPage() {
  return <SignIn />;
}
```

- [ ] **Step 4: Wrap the app in `<ClerkProvider>`**

In `app/layout.tsx`, add the import:

```tsx
import { ClerkProvider } from '@clerk/nextjs';
```

Wrap the body contents (everything currently inside `<body>`), keeping `<ColorSchemeScript>` where it is in `<head>`:

```tsx
      <body>
        <ClerkProvider appearance={{ variables: { colorPrimary: '#7c3aed' } }}>
          <ReloadOnResume />
          <MantineProvider theme={theme} defaultColorScheme="dark">
            <MeProvider>
              <Header />
              <Container size="sm" py="xl">
                {children}
              </Container>
            </MeProvider>
          </MantineProvider>
        </ClerkProvider>
      </body>
```

(`colorPrimary` matches `violet[6]` from the theme. Deeper theming of the Clerk card is optional polish, not part of this task.)

- [ ] **Step 5: Update `.env.example`**

Replace the `ADMIN_PIN` block (lines ~4-8) with:

```
# Clerk (Vercel Marketplace integration). The publishable + secret keys are
# provisioned automatically on Vercel when the integration is added; copy them
# from the Clerk dashboard into .env.local for local dev.
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in

# Comma-separated list of admin email addresses. An empty or unset value denies
# everyone (`isAdmin` fails closed), so every deployment must set this. Matched
# case-insensitively against the signed-in Clerk session's verified email.
ADMIN_ALLOWLIST=
```

- [ ] **Step 6: Verify the app boots**

```bash
pnpm build
```

Expected: build succeeds. If it complains that `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is missing, confirm `.env.local` has the real keys from Step 1.

```bash
pnpm dev
```

Visit `http://localhost:3000/sign-in` - expected: Clerk's sign-in card renders. Visit `http://localhost:3000/` - expected: the site works exactly as before (no gate yet).

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-lock.yaml app/layout.tsx app/sign-in .env.example
git commit -m "feat(auth): add Clerk provider and sign-in route"
```

---

## Task 2: Add the `isAdmin` allowlist helper

**Files:**
- Modify: `lib/admin.ts`
- Test: `lib/admin.test.ts`

**Interfaces:**
- Consumes: `process.env.ADMIN_ALLOWLIST`.
- Produces: `isAdmin(claims: { email?: unknown } | null | undefined): boolean` exported from `lib/admin.ts`. Used by `middleware.ts` (Task 3), `lib/api/guards.ts` (Task 4), `app/api/monzo/auth/route.ts` (Task 4).

- [ ] **Step 1: Write the failing tests**

Add this block to `lib/admin.test.ts` (keep the existing `checkPin` describe for now; Task 4 removes it). Add at the top-level of the file:

```ts
describe('isAdmin', () => {
  const savedAllowlist = process.env.ADMIN_ALLOWLIST;

  afterEach(() => {
    if (savedAllowlist === undefined) delete process.env.ADMIN_ALLOWLIST;
    else process.env.ADMIN_ALLOWLIST = savedAllowlist;
  });

  it('accepts an allowlisted email', () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    expect(isAdmin({ email: 'admin@example.com' })).toBe(true);
  });

  it('matches case-insensitively and ignores surrounding whitespace', () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    expect(isAdmin({ email: '  ADMIN@Example.com ' })).toBe(true);
  });

  it('matches any entry in a multi-value allowlist', () => {
    process.env.ADMIN_ALLOWLIST = 'a@x.com, b@y.com ,c@z.com';
    expect(isAdmin({ email: 'b@y.com' })).toBe(true);
  });

  it('rejects an email that is not on the list', () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    expect(isAdmin({ email: 'intruder@example.com' })).toBe(false);
  });

  it('rejects null / undefined claims', () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });

  it('rejects claims with a missing or non-string email', () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    expect(isAdmin({})).toBe(false);
    expect(isAdmin({ email: 123 })).toBe(false);
  });

  it('fails closed when ADMIN_ALLOWLIST is unset', () => {
    delete process.env.ADMIN_ALLOWLIST;
    expect(isAdmin({ email: 'admin@example.com' })).toBe(false);
  });
});
```

Update the import at the top of `lib/admin.test.ts`:

```ts
import { checkPin, isAdmin } from './admin';
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- lib/admin.test.ts
```

Expected: the `isAdmin` cases fail with `isAdmin is not a function` (or a TS build error that `isAdmin` is not exported).

- [ ] **Step 3: Implement `isAdmin`**

Add to `lib/admin.ts` (below `checkPin` for now):

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- lib/admin.test.ts
```

Expected: all `isAdmin` and `checkPin` cases pass.

- [ ] **Step 5: Commit**

```bash
git add lib/admin.ts lib/admin.test.ts
git commit -m "feat(auth): add isAdmin allowlist helper"
```

---

## Task 3: The edge gate - `middleware.ts`

**Files:**
- Create: `middleware.ts`

**Interfaces:**
- Consumes: `isAdmin` from `@/lib/admin` (Task 2); `clerkMiddleware`, `createRouteMatcher` from `@clerk/nextjs/server`.
- Produces: `/admin(.*)` redirects unauthenticated visitors to `/sign-in`; the admin API routes return `401 { error: 'unauthorised' }` when not a signed-in allowlisted admin. All other routes pass through untouched.

- [ ] **Step 1: Create `middleware.ts` at the repo root**

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';

/** The admin UI. Unauthenticated -> redirect to the Clerk sign-in. */
const isAdminPage = createRouteMatcher(['/admin(.*)']);

/**
 * Admin API. Unauthenticated -> 401 with the body every client already
 * branches on. Listed one path at a time on purpose: `/api/monzo/callback`
 * (OAuth state), `/api/monzo/webhook` (Monzo does not sign its payloads),
 * `/api/cron/*` (separate cron secret) and `/api/push/subscribe` (public)
 * must never be caught here.
 */
const isAdminApi = createRouteMatcher([
  '/api/admin/(.*)',
  '/api/monzo/status',
  '/api/monzo/captured',
  '/api/monzo/members',
  '/api/monzo/pending',
  '/api/monzo/register-webhook',
  '/api/monzo/auth',
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isAdminPage(req) && !isAdminApi(req)) return;

  const session = await auth();
  if (session.userId && isAdmin(session.sessionClaims as { email?: unknown })) return;

  if (isAdminApi(req)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  return session.redirectToSignIn();
});

export const config = {
  matcher: [
    // Everything except Next internals and static files, unless in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
    // Always run for Clerk's own frontend API routes
    '/__clerk/(.*)',
  ],
};
```

- [ ] **Step 2: Verify the build**

```bash
pnpm build
```

Expected: succeeds. A type error on `session.sessionClaims` means the cast is wrong - it should be `as { email?: unknown }`.

- [ ] **Step 3: Manual verification - logged out**

```bash
pnpm dev
```

- `curl -i http://localhost:3000/api/admin/payments` - expected: `HTTP/1.1 401` and body `{"error":"unauthorised"}`.
- `curl -i http://localhost:3000/api/monzo/webhook` - expected: **not** 401 (it is unauthenticated by design; whatever it returned before).
- Open `http://localhost:3000/admin` in a private window - expected: redirect to `/sign-in`.
- Open `http://localhost:3000/balances` - expected: loads normally (public, not gated).

- [ ] **Step 4: Manual verification - logged in**

- Sign in at `/sign-in` as the allowlisted address.
- Visit `/admin` - expected: the page renders (the panel will still 401 its API calls because the client still sends `x-admin-pin` and `guards.ts` still checks the old PIN - that is fixed in Task 4; the point here is the page is reachable and not redirected).
- `curl` an admin API with your session cookie (copy `__session` from devtools):
  `curl -i -H "Cookie: __session=<value>" http://localhost:3000/api/admin/payments` - still 401 at this point (guards.ts unchanged), acceptable; Task 4 flips it.

If you want a cleaner checkpoint, run this task and Task 4 back-to-back before the logged-in verification.

- [ ] **Step 5: Commit**

```bash
git add middleware.ts
git commit -m "feat(auth): gate /admin and the admin API with clerkMiddleware"
```

---

## Task 4: Cut server-side auth from the PIN to Clerk

**Files:**
- Modify: `lib/api/guards.ts`
- Test: `lib/api/guards.test.ts` (create)
- Modify: `app/api/monzo/auth/route.ts`
- Modify: `lib/admin.ts` (delete `checkPin`, `MIN_SECRET_LENGTH`)
- Modify: `lib/admin.test.ts` (delete the `checkPin` suite)
- Modify: `lib/cron.ts` (comment only)

**Interfaces:**
- Consumes: `auth` from `@clerk/nextjs/server`; `isAdmin` from `@/lib/admin`.
- Produces: `withAdminAuth(handler)` now authenticates via the Clerk session. Signature unchanged: `(handler: (request: Request) => Promise<Response>) => (request: Request) => Promise<Response>`. Every route file that imports it is unaffected.

- [ ] **Step 1: Write the failing tests for `withAdminAuth`**

Create `lib/api/guards.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', () => ({ auth: vi.fn() }));

import { auth } from '@clerk/nextjs/server';
import { withAdminAuth } from './guards';

const mockAuth = vi.mocked(auth);
const savedAllowlist = process.env.ADMIN_ALLOWLIST;

afterEach(() => {
  vi.clearAllMocks();
  if (savedAllowlist === undefined) delete process.env.ADMIN_ALLOWLIST;
  else process.env.ADMIN_ALLOWLIST = savedAllowlist;
});

function request() {
  return new Request('https://example.com/api/admin/toggle', { method: 'POST' });
}

describe('withAdminAuth', () => {
  it('runs the handler for a signed-in allowlisted admin', async () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    mockAuth.mockResolvedValue({
      userId: 'user_1',
      sessionClaims: { email: 'admin@example.com' },
    } as never);
    const handler = vi.fn(async () => new Response('ok', { status: 200 }));

    const response = await withAdminAuth(handler)(request());

    expect(handler).toHaveBeenCalledOnce();
    expect(response.status).toBe(200);
  });

  it('returns 401 { error: "unauthorised" } when signed out', async () => {
    mockAuth.mockResolvedValue({ userId: null, sessionClaims: null } as never);
    const handler = vi.fn(async () => new Response('ok'));

    const response = await withAdminAuth(handler)(request());

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'unauthorised' });
  });

  it('returns 401 when signed in as a non-allowlisted user', async () => {
    process.env.ADMIN_ALLOWLIST = 'admin@example.com';
    mockAuth.mockResolvedValue({
      userId: 'user_2',
      sessionClaims: { email: 'intruder@example.com' },
    } as never);
    const handler = vi.fn(async () => new Response('ok'));

    const response = await withAdminAuth(handler)(request());

    expect(handler).not.toHaveBeenCalled();
    expect(response.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm test -- lib/api/guards.test.ts
```

Expected: FAIL - the current `withAdminAuth` reads `request.headers.get('x-admin-pin')` and calls `checkPin`, so the "runs the handler" test fails (handler not called) and it never touches the mocked `auth`.

If instead the run errors on importing `next/server` under the node environment, add this line at the very top of the test file and re-run:
`// @vitest-environment node` is already the default, so this should not happen; if `NextResponse` is the problem, change the assertions to `expect(response.status)` only and drop the `.json()` check.

- [ ] **Step 3: Rewrite `withAdminAuth`**

In `lib/api/guards.ts`, replace the `checkPin` import and the `withAdminAuth` function:

```ts
import { NextResponse } from 'next/server';
import type { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { isAdmin } from '@/lib/admin';

type Handler = (request: Request) => Promise<Response>;

/**
 * Wraps a route handler with the admin check shared by most `/api` routes:
 * a signed-in Clerk session whose verified email is on `ADMIN_ALLOWLIST`.
 * Rejects with the same 401 body every one of these routes returned under the
 * old PIN scheme, so clients need no changes.
 *
 * This duplicates the check `middleware.ts` already runs for these paths, on
 * purpose: the guard is the contract each route file relies on, and a second
 * `auth()` call is cheap. Routes that authenticate differently do not use
 * this: `monzo/callback` uses OAuth state, `monzo/webhook` is unauthenticated
 * (Monzo does not sign payloads), `cron/*` checks a cron secret, and
 * `push/subscribe` is deliberately public.
 */
export function withAdminAuth(handler: Handler): Handler {
  return async (request) => {
    const { userId, sessionClaims } = await auth();
    if (!userId || !isAdmin(sessionClaims as { email?: unknown })) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
    }
    return handler(request);
  };
}
```

Leave `ParsedBody` and `parseJsonBody` unchanged.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm test -- lib/api/guards.test.ts
```

Expected: PASS (all three).

- [ ] **Step 5: Rewrite `app/api/monzo/auth/route.ts`**

Replace the file's imports and the `checkPin` gate:

```ts
import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { isAdmin } from '@/lib/admin';
import { MONZO_AUTH_URL, monzoClientCredentials, monzoRedirectUri } from '@/lib/monzo/config';

/**
 * Starts the OAuth handshake. Admin-only - this is the step that links a real
 * Monzo account, not a read of already-public league data. The browser
 * navigates here (it cannot `fetch` to Monzo's authorise screen), so the
 * Clerk session cookie rides along and `auth()` authenticates it like every
 * other admin route. `middleware.ts` also covers this path.
 */
export async function GET(request: Request) {
  const { userId, sessionClaims } = await auth();
  if (!userId || !isAdmin(sessionClaims as { email?: unknown })) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  let clientId: string;
  let redirectUri: string;
  try {
    clientId = monzoClientCredentials().clientId;
    redirectUri = monzoRedirectUri();
  } catch (error) {
    console.error('Monzo OAuth config missing', error);
    return NextResponse.json({ error: 'Monzo is not configured yet' }, { status: 503 });
  }

  const state = randomBytes(24).toString('base64url');
  const authorizeUrl = new URL('/', MONZO_AUTH_URL);
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('state', state);

  const response = NextResponse.redirect(authorizeUrl);
  // Read back on /api/monzo/callback and compared with timingSafeEqual to
  // confirm the callback is answering this request, not a forged one.
  response.cookies.set('monzo_oauth_state', state, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 600,
  });
  return response;
}
```

The `request` param is kept (unused now) for signature stability; if `oxlint` flags it as unused, rename to `_request` or drop it - `GET()` with no args is valid.

- [ ] **Step 6: Delete `checkPin` and `MIN_SECRET_LENGTH`**

`lib/admin.ts` should end up containing only `isAdmin` (and its doc comment). Remove the `node:crypto` `timingSafeEqual` import, `MIN_SECRET_LENGTH`, and the entire `checkPin` function.

- [ ] **Step 7: Delete the `checkPin` test suite**

In `lib/admin.test.ts`: remove the `describe('checkPin', ...)` block, the `LONG_ENOUGH` const, the `original` const and the `beforeEach`/`afterEach` that set `process.env.ADMIN_PIN`. Change the import to:

```ts
import { isAdmin } from './admin';
```

Keep the `isAdmin` describe block from Task 2 and its own `afterEach`. The file's top-level imports become:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { isAdmin } from './admin';
```

(`vi` is no longer used unless the `isAdmin` block needs it - it does not.)

- [ ] **Step 8: Reword the `lib/cron.ts` comment**

Find the comment referencing `checkPin` (around line 5: "same technique as `checkPin` in `admin.ts`"). Replace the cross-reference with a self-contained description, e.g. "compared with `timingSafeEqual` so a wrong secret cannot be recovered byte-by-byte from response timing". Do not change any code.

- [ ] **Step 9: Full test + build + lint**

```bash
pnpm test
pnpm build
pnpm lint
```

Expected: all green. `grep -rn "checkPin\|MIN_SECRET_LENGTH\|ADMIN_PIN" lib app` should return nothing (bar `.env.example` if you kept a stray mention - it should not).

- [ ] **Step 10: Manual verification**

```bash
pnpm dev
```

Sign in as the admin. `curl -i -H "Cookie: __session=<your session cookie>" http://localhost:3000/api/admin/payments` - expected: `200` (or `503` if Redis is unreachable locally, which is also fine - the point is it is no longer `401`). In a private window, the same curl with no cookie - expected: `401 {"error":"unauthorised"}`.

- [ ] **Step 11: Commit**

```bash
git add lib/api/guards.ts lib/api/guards.test.ts app/api/monzo/auth/route.ts lib/admin.ts lib/admin.test.ts lib/cron.ts
git commit -m "feat(auth): authenticate admin API via Clerk session, drop the PIN check"
```

---

## Task 5: Strip the PIN from the admin panel client components

**Files:**
- Create: `app/components/admin/AdminHeader.tsx`
- Modify: `app/components/admin/AdminPanel.tsx`
- Modify: `app/components/admin/MonzoConnection.tsx`
- Modify: `app/components/admin/PendingQueue.tsx`
- Modify: `app/components/admin/RecentPayments.tsx`
- Modify: `app/components/admin/CapturedPayloads.tsx`

**Interfaces:**
- Consumes: `<UserButton />` from `@clerk/nextjs`.
- Produces: `<AdminHeader />` (client) exporting the `Admin` title + sign-out. `<AdminPanel />` takes no props. `MonzoConnection`, `PendingQueue`, `RecentPayments`, `CapturedPayloads` all take no props and send no auth header (the session cookie is automatic on same-origin `fetch`).

- [ ] **Step 1: Create `AdminHeader.tsx`**

```tsx
'use client';

import { Group, Title } from '@mantine/core';
import { UserButton } from '@clerk/nextjs';

/** The /admin page heading, with the sign-out control (Clerk's UserButton). */
export function AdminHeader() {
  return (
    <Group justify="space-between" align="center" mb="lg">
      <Title order={1}>Admin</Title>
      <UserButton />
    </Group>
  );
}
```

- [ ] **Step 2: Simplify `AdminPanel.tsx`**

Remove: the `PIN_STORAGE_KEY` import, the `pin` state, the `unlock` function, the `window.prompt`, the `window.localStorage` read, and the `if (!pin) return <Button onClick={unlock}>...` early return. Keep the `?monzo=connected` banner effect (it does not touch the PIN). Render the four sections with no `pin` prop:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { Alert } from '@mantine/core';
import { CapturedPayloads } from './CapturedPayloads';
import { MonzoConnection } from './MonzoConnection';
import { PendingQueue } from './PendingQueue';
import { RecentPayments } from './RecentPayments';
import classes from './AdminPanel.module.scss';

/**
 * Capture-phase tooling for the one admin. The page this renders on is gated
 * by `middleware.ts`, so this component can assume it is only ever shown to a
 * signed-in admin - it owns only the post-OAuth banner now.
 */
export function AdminPanel() {
  const [justConnected, setJustConnected] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('monzo') === 'connected') {
      setJustConnected(true);
      url.searchParams.delete('monzo');
      window.history.replaceState({}, '', url);
    }
  }, []);

  return (
    <div className={classes.stack}>
      {justConnected && (
        <Alert color="green" variant="light" title="Monzo account authorised">
          Now confirm access in your Monzo app if it hasn't prompted already, then
          click Register webhook below. Registering right after this step often
          fails with a 403 until that confirmation lands. That's expected, just
          retry once you've confirmed.
        </Alert>
      )}

      <MonzoConnection />
      <PendingQueue />
      <RecentPayments />
      <CapturedPayloads />
    </div>
  );
}
```

- [ ] **Step 3: Simplify `MonzoConnection.tsx`**

- Change the signature to `export function MonzoConnection()` (no props).
- Both `fetch` calls: drop the `headers: { 'x-admin-pin': pin }` option entirely (`fetch('/api/monzo/status')`, `fetch('/api/monzo/register-webhook', { method: 'POST' })`).
- The "Connect / Reconnect Monzo" button `href`: change from
  `` href={`/api/monzo/auth?pin=${encodeURIComponent(pin)}`} `` to `href="/api/monzo/auth"`.
- The `status === 'unauthorised'` branch: keep the union member but change the copy, since it should not happen behind the gate:
  ```tsx
  {status === 'unauthorised' && (
    <Text size="sm" c="red" mt="sm">
      Session expired. Reload the page to sign in again.
    </Text>
  )}
  ```

- [ ] **Step 4: Simplify `PendingQueue.tsx`**

- Signature: `export function PendingQueue()`.
- `load()`: `fetch('/api/monzo/pending')` and `fetch('/api/monzo/members')` - no headers.
- `removePending`: `fetch('/api/monzo/pending', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: ... })` - keep `content-type`, drop `x-admin-pin`.
- `approvePending`: same - keep `content-type`, drop `x-admin-pin`.

- [ ] **Step 5: Simplify `RecentPayments.tsx`**

- Signature: `export function RecentPayments()`.
- `load()`: `fetch('/api/admin/payments')` and `fetch('/api/monzo/members')` - no headers.
- `reverse()`: `fetch('/api/admin/reverse-payment', { method: 'POST', headers: { 'content-type': 'application/json' }, body: ... })` - keep `content-type`, drop `x-admin-pin`.

- [ ] **Step 6: Simplify `CapturedPayloads.tsx`**

- Signature: `export function CapturedPayloads()`.
- `load()`: `fetch('/api/monzo/captured')` - no headers.

- [ ] **Step 7: Build + lint**

```bash
pnpm build
pnpm lint
```

Expected: green. Any "cannot find name `pin`" error means a `pin` reference was missed in one of the components.

- [ ] **Step 8: Commit**

```bash
git add app/components/admin/
git commit -m "refactor(admin): drop the localStorage PIN from the admin panel, add sign-out"
```

---

## Task 6: `/admin` server component with the `MarkPayments` table

**Files:**
- Modify: `app/admin/page.tsx`
- Create: `app/components/admin/MarkPayments.tsx`
- Create: `app/components/admin/MarkPayments.module.scss`
- Create: `app/components/admin/PaymentToggle.tsx`

**Interfaces:**
- Consumes: `fetchStandings` from `@/lib/fpl/client`; `resolveMembers` from `@/lib/league/members`; `buildBalances` and the `Balance` type from `@/lib/league/balances`; `safeGetResults`, `safeGetPaid`, `safeGetBuyins`, `safeGetCredit` from `@/lib/ledger/safe`; `AdminHeader` (Task 5); `Avatar` from `@/app/components/common/Avatar`.
- Produces:
  - `<MarkPayments balances={Balance[]} resultsDegraded={boolean} />` - server component.
  - `<PaymentToggle endpoint={string} requestBody={Record<string, unknown>} paid={boolean} label?={string} disabled?={boolean} />` - client component. POSTs `{ ...requestBody, paid: !paid }` to `endpoint`, then `router.refresh()`.

- [ ] **Step 1: Create `PaymentToggle.tsx`**

This is `AdminToggle` with the PIN modal, `localStorage`, and `knownAdmin` gate removed.

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Text } from '@mantine/core';

/**
 * Marks one thing paid or unpaid: a gameweek fine (`/api/admin/toggle`) or the
 * season buy-in (`/api/admin/toggle-buyin`). Rendered only inside `/admin`,
 * which `middleware.ts` gates, so there is no auth prompt here - the session
 * cookie authenticates the POST. On success it refreshes the server component
 * so the row re-renders from fresh data.
 */
export function PaymentToggle({
  endpoint,
  requestBody,
  paid,
  label,
  disabled = false,
}: {
  endpoint: string;
  requestBody: Record<string, unknown>;
  paid: boolean;
  label?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...requestBody, paid: !paid }),
      });

      if (response.ok) {
        router.refresh();
        return;
      }
      // A 401 here means the Clerk session lapsed, not a wrong secret.
      setError(
        response.status === 401
          ? 'Session expired, reload'
          : `Failed (error ${response.status})`,
      );
    } catch {
      setError('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span>
      <Button
        size="xs"
        variant={paid ? 'subtle' : 'default'}
        loading={busy}
        disabled={disabled}
        onClick={toggle}
      >
        {label ?? (paid ? 'Mark unpaid' : 'Mark paid')}
      </Button>
      {error && (
        <Text size="xs" c="red" mt={4}>
          {error}
        </Text>
      )}
    </span>
  );
}
```

- [ ] **Step 2: Create `MarkPayments.module.scss`**

```scss
.section {
  margin-bottom: var(--mantine-spacing-xl);
}

.kicker {
  font-family: var(--font-mono);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-size: var(--mantine-font-size-sm);
  color: var(--mantine-color-dark-2);
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mantine-spacing-xs);
  padding: var(--mantine-spacing-sm) 0;
  border-top: 1px solid var(--border);
}

.name {
  flex: 1 1 auto;
  min-width: 8rem;
  font-weight: 600;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
```

- [ ] **Step 3: Create `MarkPayments.tsx`**

```tsx
import { Alert, Text } from '@mantine/core';
import type { Balance } from '@/lib/league/balances';
import { Avatar } from '../common/Avatar';
import { PaymentToggle } from './PaymentToggle';
import classes from './MarkPayments.module.scss';

/**
 * The one place fines and buy-ins get marked, now that the public pages are
 * read-only. One row per member who currently owes something; each row shows
 * the buy-in (if owed) plus a toggle for every gameweek they finished bottom -
 * already-paid ones included, so a mistaken mark can be reversed from here.
 */
export function MarkPayments({
  balances,
  resultsDegraded,
}: {
  balances: Balance[];
  resultsDegraded: boolean;
}) {
  if (resultsDegraded) {
    return (
      <div className={classes.section}>
        <span className={classes.kicker}>Mark payments</span>
        <Alert color="red" variant="outline" title="Results unavailable" mt="sm">
          Could not reach the results store. Marking is disabled until it is back,
          so a fine is not recorded against stale data.
        </Alert>
      </div>
    );
  }

  const owing = balances.filter((b) => b.buyinOwed || b.unpaid.length > 0);

  return (
    <div className={classes.section}>
      <span className={classes.kicker}>Mark payments</span>

      {owing.length === 0 && (
        <Text size="sm" c="dimmed" mt="sm">
          Everyone is paid up.
        </Text>
      )}

      {owing.map((balance) => {
        const unpaid = new Set(balance.unpaid);
        return (
          <div key={balance.member.entryId} className={classes.row}>
            <Avatar
              teamName={balance.member.teamName}
              managerName={balance.member.managerName}
              size={32}
            />
            <span className={classes.name}>{balance.member.teamName}</span>
            <span className={classes.chips}>
              {balance.buyinOwed && (
                <PaymentToggle
                  endpoint="/api/admin/toggle-buyin"
                  requestBody={{ entryId: balance.member.entryId }}
                  paid={false}
                  label="Buy-in"
                />
              )}
              {balance.lost.map((gameweek) => (
                <PaymentToggle
                  key={gameweek}
                  endpoint="/api/admin/toggle"
                  requestBody={{ gameweek, entryId: balance.member.entryId }}
                  paid={!unpaid.has(gameweek)}
                  label={`GW${gameweek}`}
                />
              ))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Rewrite `app/admin/page.tsx`**

```tsx
import { fetchStandings } from '@/lib/fpl/client';
import { buildBalances } from '@/lib/league/balances';
import { resolveMembers } from '@/lib/league/members';
import { safeGetBuyins, safeGetCredit, safeGetPaid, safeGetResults } from '@/lib/ledger/safe';
import { AdminHeader } from '../components/admin/AdminHeader';
import { AdminPanel } from '../components/admin/AdminPanel';
import { MarkPayments } from '../components/admin/MarkPayments';

export const dynamic = 'force-dynamic';

/**
 * Deliberately unlinked from every public page, and now gated by
 * `middleware.ts` - an unauthenticated visitor is redirected to `/sign-in`
 * before this renders. The balances fetch mirrors `/balances`; it feeds the
 * marking table, which is the only place fines and buy-ins are toggled now.
 */
export default async function AdminPage() {
  const [standings, resultsState, paidState, buyinsState, creditState] = await Promise.all([
    fetchStandings(3600),
    safeGetResults(),
    safeGetPaid(),
    safeGetBuyins(),
    safeGetCredit(),
  ]);

  const balances = buildBalances({
    members: resolveMembers(standings),
    results: resultsState.results,
    paid: paidState.paid,
    buyins: buyinsState.buyins,
    credit: creditState.credit,
  });

  return (
    <>
      <AdminHeader />
      <MarkPayments balances={balances} resultsDegraded={resultsState.degraded} />
      <AdminPanel />
    </>
  );
}
```

Note: `fetchStandings` can throw (unlike the `safeGet*` helpers). If the FPL API being down should not 500 the whole admin page, wrap it:
```tsx
const standings = await fetchStandings(3600).catch(() => null);
// ...then: members: standings ? resolveMembers(standings) : [],
// and pass resultsDegraded={resultsState.degraded || !standings}
```
Use this guarded form - a dead FPL API should degrade the marking table, not the Monzo tooling below it.

- [ ] **Step 5: Build + lint**

```bash
pnpm build
pnpm lint
```

Expected: green.

- [ ] **Step 6: Manual verification**

```bash
pnpm dev
```

Signed in as admin, visit `/admin`:
- The `Admin` title shows with a Clerk user avatar (sign-out) on the right.
- A "Mark payments" section lists members who owe, each with `Buy-in` / `GWn` buttons.
- Click a `GWn` button - it shows a loading state, then the page refreshes and the button flips between "GW3" styling for paid/unpaid (paid = subtle, unpaid = default). Confirm against `/balances` that the fine's paid state actually changed.
- If your local Redis is down: the section shows the red "Results unavailable" alert and the Monzo panel below still works.

- [ ] **Step 7: Commit**

```bash
git add app/admin/page.tsx app/components/admin/MarkPayments.tsx app/components/admin/MarkPayments.module.scss app/components/admin/PaymentToggle.tsx
git commit -m "feat(admin): add the in-admin Mark payments table"
```

---

## Task 7: Make the public pages read-only, delete `AdminToggle`

**Files:**
- Modify: `app/components/home/LoserCard.tsx`
- Modify: `app/components/balances/BalancesTable.tsx`
- Delete: `app/components/common/AdminToggle.tsx`
- Delete: `lib/adminPinStorage.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `/` and `/balances` render no admin controls. `PIN_STORAGE_KEY` no longer exists anywhere.

- [ ] **Step 1: Remove the toggle block from `LoserCard.tsx`**

- Delete the import `import { AdminToggle } from '../common/AdminToggle';`.
- Delete the `<div className={classes.adminRow}>...</div>` block (around lines 137-144) that wraps the `<AdminToggle endpoint="/api/admin/toggle" .../>`.
- Leave `.adminRow` in `LoserCard.module.scss` or remove it; removing it is tidier since nothing references it. (`grep -n adminRow app/components/home/LoserCard.module.scss` then delete that rule.)

- [ ] **Step 2: Remove the toggle block from `BalancesTable.tsx`**

- Delete the import `import { AdminToggle } from '../common/AdminToggle';`.
- Delete the entire block:
  ```tsx
  {!resultsDegraded && (balance.buyinOwed || balance.unpaid.length > 0) && (
    <Group gap={6} mt="xs" className={classes.toggles}>
      ...
    </Group>
  )}
  ```
- If `Group` is now unused in the file, remove it from the `@mantine/core` import.
- Remove the `.toggles` rule from `BalancesTable.module.scss` (nothing else uses it - confirm with grep).

- [ ] **Step 3: Delete the dead files**

```bash
git rm app/components/common/AdminToggle.tsx lib/adminPinStorage.ts
```

- [ ] **Step 4: Sweep for stragglers**

```bash
grep -rn "AdminToggle\|PIN_STORAGE_KEY\|adminPinStorage\|evicted-admin-pin" app lib
```

Expected: no matches.

- [ ] **Step 5: Build + lint + test**

```bash
pnpm build
pnpm lint
pnpm test
```

Expected: all green.

- [ ] **Step 6: Manual verification**

```bash
pnpm dev
```

- `/` (this week): the loser card has no "Mark paid" button.
- `/balances`: no per-row `Buy-in` / `GWn` buttons; the table is otherwise unchanged.
- Both pages render fine whether signed in or out.

- [ ] **Step 7: Commit**

```bash
git add app/components/home/LoserCard.tsx app/components/home/LoserCard.module.scss app/components/balances/BalancesTable.tsx app/components/balances/BalancesTable.module.scss
git commit -m "refactor: make / and /balances read-only, remove the inline admin toggles"
```

---

## Task 8: Docs, final sweep, production cutover

**Files:**
- Modify: `next.config.ts` (comment only), `README.md`, `CONTEXT.md`
- Check: `docs/agents/domain.md`, `docs/agents/issue-tracker.md`

**Interfaces:**
- Consumes: nothing.
- Produces: docs consistent with the Clerk model; `ADMIN_PIN` gone from the codebase and (after verification) from Vercel.

- [ ] **Step 1: Reword the `next.config.ts` comment**

The `headers()` comment currently explains the `Referrer-Policy` in terms of `/api/monzo/auth`'s `?pin=` query string. That query param no longer exists. Replace the comment with something like:

```ts
  // Make the modern-browser default explicit: a cross-origin `Referer` carries
  // only the origin, never the path or query. Nothing sensitive rides in a URL
  // here now, but it is a sound default to state rather than inherit.
```

Do not change the header itself.

- [ ] **Step 2: Reword the `README.md` line**

Line ~35-36 currently reads: "Hobby cannot password-protect a production domain, and the data is already visible to all seven in the FPL app. The admin PIN protects only writes."

Replace with: "Hobby cannot password-protect a production domain, and the data is already visible to all seven in the FPL app. `/admin` is gated by Clerk (allowlisted to one address); every admin write also rechecks the session server-side."

- [ ] **Step 3: Add an "Admin auth" note to `CONTEXT.md`**

Under "## Key decisions" (or a new short "## Admin" section), add:

```markdown
- **Admin auth** - `/admin` and the admin API routes are gated by Clerk
  (`middleware.ts`) and restricted to the emails in `ADMIN_ALLOWLIST` via
  `isAdmin` in `lib/admin.ts`. There is one admin. No PIN.
```

- [ ] **Step 4: Check the agent docs**

```bash
grep -rn "PIN\|admin" docs/agents/
```

If `domain.md` or `issue-tracker.md` describes the PIN flow, update it to the Clerk flow. If they do not mention it, no change.

- [ ] **Step 5: Full local gate**

```bash
pnpm test
pnpm build
pnpm lint
grep -rn "checkPin\|ADMIN_PIN\|MIN_SECRET_LENGTH\|x-admin-pin\|PIN_STORAGE_KEY\|AdminToggle" app lib docs/agents README.md CONTEXT.md
```

Expected: tests / build / lint green; the grep returns nothing (matches in `docs/superpowers/` history files are fine and expected - scope the grep as shown).

- [ ] **Step 6: Commit**

```bash
git add next.config.ts README.md CONTEXT.md docs/agents
git commit -m "docs: describe the Clerk admin gate, drop PIN references"
```

- [ ] **Step 7: Merge to main (prod deploy)**

```bash
git checkout main
git merge --no-ff feat/admin-auth-clerk
git push
```

- [ ] **Step 8: Production verification**

After the Vercel deploy completes (check via the Vercel MCP / dashboard):

1. Private window -> `https://evicted.dev/admin` - expected: redirect to `/sign-in`.
2. `curl -i https://evicted.dev/api/admin/payments` - expected: `401 {"error":"unauthorised"}`.
3. Sign in as `alexander.mcguiness@gmail.com` -> `/admin` loads; "Mark payments" lists members; toggling a fine works and shows on `/balances`.
4. "Connect Monzo" in the admin panel still starts the OAuth flow and returns to `/admin?monzo=connected`.
5. `/` and `/balances` have no admin buttons.
6. (If you can) sign in with a different Google account -> `/admin` should redirect / show Clerk's "not allowed" state; if it somehow loads, the API calls still 401 via `isAdmin`. If a non-allowlisted account can sign in at all, tighten the Clerk dashboard restriction.

- [ ] **Step 9: Remove `ADMIN_PIN` from Vercel**

Only after steps 1-6 pass. In the Vercel project settings, delete the `ADMIN_PIN` environment variable from all environments. Redeploy is not required (nothing reads it), but a no-op redeploy confirms nothing broke.

- [ ] **Step 10: Update memory**

The deploy-mechanism / admin model changed. If a memory file describes the PIN, update it to note admin is now Clerk + `ADMIN_ALLOWLIST`.

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| §2 Provisioning Clerk | Task 1 (steps 1-2) |
| §3 `middleware.ts` gate | Task 3 |
| §3 `isAdmin` in `lib/admin.ts` | Task 2 |
| §3 session-token email claim | Task 1 step 1.2 |
| §4 API guard swap | Task 4 (steps 1-4) |
| §4 `/api/monzo/auth` fix | Task 4 step 5 |
| §5 sign-in page + layout | Task 1 (steps 3-4) |
| §5 `<UserButton />` in `/admin` header | Task 5 step 1 (`AdminHeader`) |
| §6 `/admin` server component + `MarkPayments` | Task 6 |
| §6 `PaymentToggle` (stripped `AdminToggle`) | Task 6 step 1 |
| §6 public pages read-only | Task 7 (steps 1-2) |
| §7 admin panel cleanup | Task 5 (steps 2-6) |
| §8 delete `lib/adminPinStorage.ts` | Task 7 step 3 |
| §9 env / `next.config.ts` / `lib/cron.ts` / docs | Task 1 step 5, Task 4 step 8, Task 8 |
| §10 tests (`isAdmin`, `guards`) | Task 2, Task 4 step 1 |
| §10 `checkPin` suite removed | Task 4 step 7 |
| §11 rollout order | Task 8 (steps 7-9) |

No gaps.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". The one deliberate branch (guarded `fetchStandings` in Task 6 step 4) shows both forms and picks one. The `next/server` test caveat in Task 4 step 2 gives a concrete fallback.

**3. Type consistency:**
- `isAdmin(claims: { email?: unknown } | null | undefined)` - defined Task 2, called identically in Task 3 (`session.sessionClaims as { email?: unknown }`) and Task 4 (`sessionClaims as { email?: unknown }`).
- `withAdminAuth` signature unchanged (`Handler = (request: Request) => Promise<Response>`) - Task 4 keeps it; no route files touched.
- `PaymentToggle` props (`endpoint`, `requestBody`, `paid`, `label?`, `disabled?`) - defined Task 6 step 1, consumed Task 6 step 3 with exactly those names. `MarkPayments` computes `paid={!unpaid.has(gameweek)}` from `balances.unpaid`, which matches the `Balance` type (`unpaid: number[]`, `lost: number[]`, `buyinOwed: boolean`) read from `@/lib/league/balances`.
- `AdminPanel` goes from `{ }` (was already prop-light) to no props; `MonzoConnection`/`PendingQueue`/`RecentPayments`/`CapturedPayloads` go from `{ pin: string }` to no props - all four call sites updated in Task 5 step 2.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-30-admin-auth-clerk.md`. Two execution options:**

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration. Note Task 1 step 1 and Task 8 steps 7-9 need you (Clerk dashboard, merge, Vercel env).

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**
