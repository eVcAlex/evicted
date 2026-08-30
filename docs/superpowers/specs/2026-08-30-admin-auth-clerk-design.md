# Admin login with Clerk, replacing the PIN — design

**Date:** 2026-08-30
**Status:** Approved, not yet implemented

Today `/admin` renders its full shell to anyone who visits. There is no gate on
the page. The only thing that actually stops a stranger is that each
`/api/admin/*` and admin `/api/monzo/*` call rechecks `ADMIN_PIN` from an
`x-admin-pin` header; the buttons, section headings and layout are visible
regardless. The unlock itself is a `window.prompt` whose value is kept in
`localStorage` and replayed on every request, including from the inline
"Mark paid" buttons on the public `/` and `/balances` pages.

This design replaces that with a real login. Clerk (Vercel Marketplace) gates
`/admin` at the edge so an unauthenticated visitor never sees the shell, the
session cookie authenticates every admin API call, and all admin actions move
off the public pages into `/admin`.

## 1. Verified facts

Checked against the repo on 2026-08-30.

| Fact | Value |
|---|---|
| Framework | Next.js `16.3.1`, App Router, React 19, Mantine 9 |
| Node | `24.14.1` local; Vercel default 24. Clerk Core 3 needs >= 20.9 — fine |
| Deploy | `git push` to `main` = Vercel prod deploy; no CLI |
| Admin identity | one person, `alexander.mcguiness@gmail.com`. `ADMIN_ENTRY = 394534` |
| Page gate today | none — `app/admin/page.tsx` is `force-dynamic`, renders `<AdminPanel>` unconditionally |
| API gate today | `withAdminAuth` in `lib/api/guards.ts` wraps handlers, calls `checkPin(header)` |
| Routes using `withAdminAuth` | `/api/admin/toggle`, `/api/admin/toggle-buyin`, `/api/admin/reverse-payment`, `/api/admin/payments`, `/api/monzo/captured`, `/api/monzo/status`, `/api/monzo/members`, `/api/monzo/register-webhook`, `/api/monzo/pending` (GET/POST/DELETE) |
| Special-case routes | `/api/monzo/auth` reads `?pin=` from the query (browser navigation, no headers); `/api/monzo/callback` uses OAuth `state`; `/api/monzo/webhook` deliberately unauthenticated; `/api/cron/*` uses a cron secret; `/api/push/subscribe` deliberately public |
| PIN plumbing | `lib/admin.ts` (`checkPin`, `MIN_SECRET_LENGTH`), `lib/adminPinStorage.ts` (`PIN_STORAGE_KEY`), `lib/admin.test.ts` |
| Inline admin on public pages | `AdminToggle` used in `app/components/home/LoserCard.tsx` (`/`) and `app/components/balances/BalancesTable.tsx` (`/balances`) |
| Admin panel components | `AdminPanel` threads a `pin` prop to `MonzoConnection`, `PendingQueue`, `RecentPayments`, `CapturedPayloads`; each sends `x-admin-pin` |
| Clerk middleware file | Clerk Core 3 docs use `middleware.ts`; Next 16.3 still ships the `middleware` template. `proxy.ts` is available but not required — use `middleware.ts` |

### Consequences

- **The session cookie replaces the header on every admin call.** Same-origin
  `fetch` sends it automatically, so client components stop passing anything.
  The 401 body (`{ error: 'unauthorised' }`) is kept exactly, because
  `AdminToggle` / `MonzoConnection` branch on `response.status === 401`.
- **`withAdminAuth`'s signature does not change.** It stays
  `(handler) => handler`; only its body swaps `checkPin` for a Clerk check.
  None of the ~10 route files are edited.
- **Two enforcement layers, both fail closed.** Clerk restricts who can sign in
  (dashboard allowlist), and `isAdmin()` rechecks the session email against
  `ADMIN_ALLOWLIST` in code. An unset `ADMIN_ALLOWLIST` denies everyone.
- **`/admin` becomes a server component.** It runs the same league fetch as
  `/balances` to feed the new payments table, then renders the (still client)
  panel below it.
- **No data migration.** Nothing about the ledger, stores, or league data
  changes. `ADMIN_PIN` is removed from Vercel only after the new flow is
  confirmed working in production.

## 2. Provisioning Clerk

Clerk is a connectable Marketplace integration; the CLI provisions the
resource and env vars but the account setup is a dashboard step.

1. `vercel integration add clerk --yes` — provisions and sets
   `CLERK_SECRET_KEY` and `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` on the Vercel
   project (all environments).
2. **Manual, in the Clerk dashboard:**
   - Create the single admin user (email + Google as sign-in options).
   - Restrictions → **disable public sign-up**, add
     `alexander.mcguiness@gmail.com` to the allowlist.
   - Theme the sign-in to dark (or accept default; the page wraps it in the
     Mantine dark ground anyway).
3. `pnpm add @clerk/nextjs`
4. `vercel env pull` to get the keys into `.env.local` for dev.

If `vercel integration add` cannot complete non-interactively, fall back to
`vercel integration open clerk` and finish in the browser, then set the two
env vars by hand from the Clerk dashboard keys.

## 3. The gate — `middleware.ts`

New file at repo root:

```ts
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';

const isAdminPage = createRouteMatcher(['/admin(.*)']);
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
  if (session.userId && isAdmin(session.sessionClaims)) return;

  if (isAdminApi(req)) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }
  return session.redirectToSignIn();
});

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
    '/__clerk/(.*)',
  ],
};
```

- **Not matched, so untouched:** every public page, `/api/monzo/callback`,
  `/api/monzo/webhook`, `/api/cron/*`, `/api/push/subscribe`.
- The API branch returns the same 401 body clients already handle, rather than
  Clerk's default 404 from `auth.protect()`.
- Exact API paths are listed rather than a blanket `/api/monzo/(.*)` so
  `callback` and `webhook` are never accidentally caught.

### `isAdmin` in `lib/admin.ts`

`lib/admin.ts` loses `checkPin` and `MIN_SECRET_LENGTH`, gains:

```ts
/**
 * True when the signed-in Clerk session belongs to an allowlisted admin.
 * `ADMIN_ALLOWLIST` is a comma-separated list of email addresses. Unset or
 * empty denies everyone, so a misconfigured deployment fails closed.
 */
export function isAdmin(sessionClaims: { email?: string } | null | undefined): boolean {
  const email = sessionClaims?.email?.toLowerCase().trim();
  if (!email) return false;
  const allowed = (process.env.ADMIN_ALLOWLIST ?? '')
    .split(',')
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);
  return allowed.includes(email);
}
```

The exact shape of `sessionClaims` and where the email sits (`sessionClaims.email`
vs a custom claim) is confirmed during implementation against the installed
`@clerk/nextjs` types; a session-token customization in the Clerk dashboard may
be needed to include `email`. `isAdmin` takes whatever object carries the
verified email so it is trivially unit-testable.

## 4. API guard — `lib/api/guards.ts`

`withAdminAuth` swaps its body:

```ts
import { auth } from '@clerk/nextjs/server';
import { isAdmin } from '@/lib/admin';

export function withAdminAuth(handler: Handler): Handler {
  return async (request) => {
    const { userId, sessionClaims } = await auth();
    if (!userId || !isAdmin(sessionClaims)) {
      return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
    }
    return handler(request);
  };
}
```

This is redundant with the middleware for the listed routes, and deliberately
kept: the guard is the contract each route file relies on, and defence in depth
costs one `auth()` call. `parseJsonBody` is unchanged.

`/api/monzo/auth/route.ts` drops the `?pin=` read and the `checkPin` import; it
relies on `withAdminAuth`-equivalent middleware coverage plus its own `auth()`
check (mirror the guard). Its file comment is rewritten — the "PIN in a URL"
paragraph no longer applies; the OAuth `state` cookie logic stays.

## 5. Sign-in page and layout

- `app/sign-in/[[...sign-in]]/page.tsx`:

  ```tsx
  import { SignIn } from '@clerk/nextjs';
  export default function Page() {
    return <SignIn />;
  }
  ```

  Wrapped by the existing root layout `Container`, so it sits on the dark
  ground. No sign-up route (single user).

- `app/layout.tsx`: wrap the body contents in `<ClerkProvider>`. Per Clerk
  Core 3 + Next 16, `<ClerkProvider>` goes **inside** `<body>`, around
  `<MantineProvider>` (or just around `{children}` if provider order causes
  hydration issues — determined during implementation).

- `.env.local` / `.env.example`: `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`.

- `/admin` header: add Clerk's `<UserButton />` next to the `Admin` title.
  Sign-out lives there. `<UserButton>` is a client component, so it goes in a
  small client wrapper or in `AdminPanel`.

## 6. `/admin` becomes a server component with a payments table

`app/admin/page.tsx`:

```tsx
export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const [standings, resultsState, paidState, buyinsState, creditState] =
    await Promise.all([
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
      <AdminHeader />           {/* client: title + <UserButton/> */}
      <MarkPayments balances={balances} resultsDegraded={resultsState.degraded} />
      <AdminPanel />
    </>
  );
}
```

This is exactly the `/balances` page's fetch block, lifted. If it proves worth
sharing, extract a `loadBalances()` helper in `lib/league/`; not required.

### `app/components/admin/MarkPayments.tsx`

- Server component. Renders one row per member that currently has something
  owed: `buyinOwed` true or a non-empty `unpaid` array (same visibility rule as
  `BalancesTable`'s toggle block). A member fully paid up does not appear.
- Each row: member name, a buy-in `<PaymentToggle>` if `buyinOwed`, then one
  `<PaymentToggle>` per gameweek in the member's `lost` array. The `lost`
  gameweeks the member has already paid render in their `paid={true}` state so
  a mistaken mark can be reversed from here; the unpaid ones render
  `paid={false}`. This matches `LoserCard`'s existing `paid={settled}` toggle.
- `resultsDegraded` → render the same red "treat as unknown" alert as
  `/balances` and disable the toggles.

### `app/components/admin/PaymentToggle.tsx`

`AdminToggle` moved here and stripped:

- **Removed:** `PIN_STORAGE_KEY` import, `localStorage` read/write, `knownAdmin`
  gate, the `Modal` + `PasswordInput` PIN form, the `pin` state.
- **Kept:** `endpoint`, `requestBody`, `paid`, `label`, `variant` props; the
  POST with `{ ...requestBody, paid: !paid }`; `router.refresh()` on success;
  the `response.status === 401` vs other-error distinction, now surfaced as
  inline text (a 401 here means the session expired — show "Session expired,
  reload" rather than a PIN prompt).
- No `content-type`-only change: still `POST` JSON, just no `x-admin-pin`
  header.

### Public pages

- `app/components/common/AdminToggle.tsx` — deleted.
- `LoserCard.tsx` — remove the `AdminToggle` import and the `.adminRow` block.
- `BalancesTable.tsx` — remove the `AdminToggle` import and the entire
  `{!resultsDegraded && (balance.buyinOwed || ...) && <Group>...</Group>}`
  block. `/` and `/balances` are now read-only.

## 7. Admin panel cleanup

- `AdminPanel.tsx` — remove `pin` state, `unlock`, the `window.prompt`, the
  `PIN_STORAGE_KEY` import and the `if (!pin) return <Button>` early return.
  Keep the `?monzo=connected` banner logic. Render the four sections with no
  `pin` prop.
- `MonzoConnection.tsx` — drop the `pin` prop; drop `x-admin-pin` from both
  fetches; the "Connect Monzo" link becomes `href="/api/monzo/auth"` (no
  query); the `status === 'unauthorised'` branch becomes a generic
  "session expired, reload" line (it should not happen behind the gate).
- `PendingQueue.tsx`, `RecentPayments.tsx`, `CapturedPayloads.tsx` — drop the
  `pin` prop and every `x-admin-pin` header.

## 8. `lib/adminPinStorage.ts`

Deleted. Its only consumers are `AdminPanel`, `AdminToggle` and
`MonzoConnection`, all handled above. Grep for `PIN_STORAGE_KEY` /
`evicted-admin-pin` must return nothing after.

## 9. Env, config, docs

- **`.env.example`:** remove `ADMIN_PIN` and its comment; add
  `CLERK_SECRET_KEY`, `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`,
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, and `ADMIN_ALLOWLIST` with a
  comment (comma-separated admin emails; empty denies everyone).
- **Vercel:** after production cutover is confirmed, `vercel env rm ADMIN_PIN`
  for all environments. Not before.
- **`next.config.ts`:** the `Referrer-Policy` header stays. Its comment
  referencing `/api/monzo/auth?pin=...` is rewritten — the query param is
  gone, but the header is still a reasonable default; the comment just drops
  the PIN-specific paragraph.
- **`lib/cron.ts`:** the comment "same technique as `checkPin` in `admin.ts`"
  changes to describe the timing-safe comparison directly, since `checkPin`
  will not exist.
- **`docs/agents/`:** if any file documents the PIN, update it. `CONTEXT.md`
  does not mention auth; add a one-line "Admin auth" note pointing at Clerk +
  `ADMIN_ALLOWLIST`.
- No em dashes in any new or edited copy, comments, or commit messages.

## 10. Tests

- **`lib/admin.test.ts`:** replace the `checkPin` suite with an `isAdmin`
  suite:
  - allowlisted email (exact) → true
  - allowlisted email with different case / surrounding whitespace → true
  - email not in the list → false
  - `null` / `undefined` claims → false
  - `ADMIN_ALLOWLIST` unset → false even for a plausible email
  - `ADMIN_ALLOWLIST` with multiple entries → matches any
- **`lib/api/guards.test.ts` (new, optional but recommended):** mock
  `@clerk/nextjs/server`'s `auth` to return a signed-in / signed-out /
  wrong-email session and assert `withAdminAuth` passes through vs returns
  401. Keeps the guard contract covered now that it is the only code path.
- No middleware or React component test infrastructure exists. Middleware
  behaviour, the sign-in redirect, and the `MarkPayments` table are covered by
  the manual verification steps in the implementation plan.

## 11. Rollout order

1. Provision Clerk, set env vars on Vercel (§2).
2. Land all code changes on a branch; verify locally with `vercel env pull`.
3. Merge to `main` → prod deploy.
4. Confirm in production: `/admin` redirects to `/sign-in` when logged out;
   sign in as the admin email → panel loads; sign in as any other email (if
   possible to test) → denied; a public page has no "Mark paid" buttons;
   marking a payment from `/admin` still works; Monzo connect still works.
5. Only then: `vercel env rm ADMIN_PIN`.

## 12. Out of scope

- Multiple admins or roles. `ADMIN_ALLOWLIST` is a list, but the app treats
  every entry as a full admin; no per-action permissions.
- Rate limiting, audit logging of admin sign-ins (Clerk's dashboard covers
  the latter).
- Touching `/api/monzo/webhook`, `/api/monzo/callback`, `/api/cron/*`,
  `/api/push/subscribe`.
- Any change to the ledger, stores, waterfall, or league math.
