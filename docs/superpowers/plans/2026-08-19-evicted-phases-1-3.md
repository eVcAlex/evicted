# Evicted — Phases 1–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a public dashboard for FPL mini-league 79294 that names the lowest net scorer each gameweek and tracks whether they have paid their £2 fine.

**Architecture:** Next.js App Router on Vercel. FPL data is fetched server-side and cached with ISR so seven visitors produce one upstream fetch. All contestable rules live in pure, I/O-free functions (`scoring.ts`, `reconcile.ts`) that are tested without mocks. Paid/unpaid state lives in Upstash Redis. Gameweek results are recorded lazily on page load rather than by cron.

**Tech Stack:** Next.js 16.3.1, React 19.2.8, Mantine 9.5.1, Sass (`sass-embedded` 1.102.0) with CSS modules, Upstash Redis 1.38.2, Zod 4.4.3, Vitest 4.1.11, TypeScript 7.0.2, pnpm, oxlint.

**Spec:** `docs/superpowers/specs/2026-08-19-evicted-fine-tracker-design.md`

## Global Constraints

- League ID is `79294`. Admin entry is `394534`. Fine is `200` pence. These live only in `lib/config.ts`; no other file hardcodes them.
- Net score is always `points - event_transfers_cost` derived from `entry/{id}/history/`. `event_total` from league standings is never read.
- Nothing is written to Redis for a gameweek unless `bootstrap-static` reports that gameweek as both `finished: true` and `data_checked: true`.
- Every manager tied at the lowest net score is a loser. Ties are not broken.
- All FPL requests send a browser `User-Agent` header. Without it the API can reject the request.
- The admin PIN is never placed in a URL, query string, or link. It travels in a request header only.
- Package manager is `pnpm`. Linter is `oxlint`, not ESLint.
- **Styling:** custom styles live in `*.module.scss` files imported as
  `import classes from './Component.module.scss'` and applied via `className={classes.x}`.
  Mantine's own props (`gap`, `c`, `fw`, `size`, `ta`, `mt`) are fine and preferred for
  spacing and typography. Inline `style={{ ... }}` objects are not used.
- **Sass replaces the PostCSS preset's mixins.** `postcss-preset-mantine`'s `@mixin dark`,
  `@mixin smaller-than` and `rem()` do not work inside `.scss` — Sass compiles first and
  its own `@mixin` syntax collides. Sass equivalents live in `_mantine.scss` at the repo
  root and are auto-injected as the `mantine` namespace, so use `@include mantine.dark { }`
  and `mantine.rem(16)`. Both `postcss.config.cjs` and `_mantine.scss` are required.
- Scope is phases 1–3 of the spec. Monzo reconciliation (spec §5) and squad detail (spec §4) are explicitly out of scope and get their own plans.

---

### Task 1: Scaffold Next.js, Mantine and Vitest

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.cjs`, `app/layout.tsx`, `app/page.tsx`, `vitest.config.ts`, `lib/config.ts`, `lib/config.test.ts`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing.
- Produces: `lib/config.ts` exporting `LEAGUE_ID: number`, `ADMIN_ENTRY: number`, `FINE_PENCE: number`; a working `pnpm test` and `pnpm dev`.

- [ ] **Step 1: Scaffold the app**

Run from the repo root. The repo already contains `README.md`, `CLAUDE.md`, `docs/` and `.gitignore` — scaffold in place rather than into a subdirectory.

```bash
pnpm dlx create-next-app@16.3.1 . --typescript --app --no-tailwind --no-eslint --no-src-dir --import-alias "@/*" --use-pnpm
```

If it refuses because the directory is non-empty, answer yes to proceeding; it does not delete existing files.

- [ ] **Step 2: Install runtime and dev dependencies**

```bash
pnpm add next@16.3.1 react@19.2.8 react-dom@19.2.8 @mantine/core@9.5.1 @mantine/hooks@9.5.1 @upstash/redis@1.38.2 zod@4.4.3
pnpm add -D typescript@7.0.2 vitest@4.1.11 postcss postcss-preset-mantine@1.18.0 postcss-simple-vars@7.0.1 sass-embedded@1.102.0 oxlint
```

`sass-embedded` rather than `sass`: it is what Mantine's Sass guide specifies and what
`sassOptions.implementation` is pointed at in the next step.

- [ ] **Step 3: Create the PostCSS config**

Mantine requires this exact file. Create `postcss.config.cjs`:

```js
module.exports = {
  plugins: {
    'postcss-preset-mantine': {},
    'postcss-simple-vars': {
      variables: {
        'mantine-breakpoint-xs': '36em',
        'mantine-breakpoint-sm': '48em',
        'mantine-breakpoint-md': '62em',
        'mantine-breakpoint-lg': '75em',
        'mantine-breakpoint-xl': '88em',
      },
    },
  },
};
```

- [ ] **Step 3b: Create the Sass helpers**

Create `_mantine.scss` at the repo root. These are the Sass equivalents of the
PostCSS preset's mixins, which do not work inside `.scss` files.

```scss
@use 'sass:math';

// Must match the breakpoints in postcss.config.cjs and the Mantine theme.
$mantine-breakpoint-xs: '36em';
$mantine-breakpoint-sm: '48em';
$mantine-breakpoint-md: '62em';
$mantine-breakpoint-lg: '75em';
$mantine-breakpoint-xl: '88em';

@function rem($value) {
  @return #{math.div(math.div($value, $value * 0 + 1), 16)}rem;
}

@mixin light {
  [data-mantine-color-scheme='light'] & {
    @content;
  }
}

@mixin dark {
  [data-mantine-color-scheme='dark'] & {
    @content;
  }
}

@mixin hover {
  @media (hover: hover) {
    &:hover {
      @content;
    }
  }

  @media (hover: none) {
    &:active {
      @content;
    }
  }
}

@mixin smaller-than($breakpoint) {
  @media (max-width: $breakpoint) {
    @content;
  }
}

@mixin larger-than($breakpoint) {
  @media (min-width: $breakpoint) {
    @content;
  }
}
```

- [ ] **Step 3c: Point Next.js at the Sass helpers**

Replace `next.config.ts` entirely. `additionalData` prepends the `@use` to every
`.scss` file, so components never import it themselves.

```ts
import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  sassOptions: {
    implementation: 'sass-embedded',
    additionalData: `@use "${path.join(process.cwd(), '_mantine').replace(/\\/g, '/')}" as mantine;`,
  },
};

export default nextConfig;
```

- [ ] **Step 4: Wire Mantine into the root layout**

Replace `app/layout.tsx` entirely. `mantineHtmlProps` and `ColorSchemeScript` are both required — without them the page flashes the wrong colour scheme on load.

```tsx
import '@mantine/core/styles.css';

import {
  ColorSchemeScript,
  MantineProvider,
  createTheme,
  mantineHtmlProps,
} from '@mantine/core';

export const metadata = {
  title: 'Evicted',
  description: 'Who finished bottom this week, and have they paid up',
};

const theme = createTheme({
  primaryColor: 'red',
  defaultRadius: 'md',
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" {...mantineHtmlProps}>
      <head>
        <ColorSchemeScript defaultColorScheme="dark" />
      </head>
      <body>
        <MantineProvider theme={theme} defaultColorScheme="dark">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Create the Vitest config**

Tests are pure Node — no jsdom, no React component tests in this plan. Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Add scripts to `package.json`**

Ensure the `scripts` block contains exactly these entries:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "oxlint lib app",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 7: Write the failing test for config**

Create `lib/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ADMIN_ENTRY, FINE_PENCE, LEAGUE_ID } from './config';

describe('config', () => {
  it('points at the Evicted league', () => {
    expect(LEAGUE_ID).toBe(79294);
  });

  it('knows the admin entry', () => {
    expect(ADMIN_ENTRY).toBe(394534);
  });

  it('sets the fine at two pounds in pence', () => {
    expect(FINE_PENCE).toBe(200);
  });
});
```

- [ ] **Step 8: Run the test to verify it fails**

Run: `pnpm test`
Expected: FAIL — cannot resolve `./config`.

- [ ] **Step 9: Write the config module**

Create `lib/config.ts`:

```ts
/** FPL classic league "Evicted". */
export const LEAGUE_ID = 79294;

/** Alex McGuiness, "Høgh are you?" — the league admin and fine collector. */
export const ADMIN_ENTRY = 394534;

/** The fine for finishing bottom of a gameweek, in pence. */
export const FINE_PENCE = 200;

/** Base URL for the official FPL API. */
export const FPL_BASE = 'https://fantasy.premierleague.com/api';

/**
 * The FPL API rejects requests without a browser-like User-Agent.
 */
export const FPL_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
```

- [ ] **Step 10: Run the test to verify it passes**

Run: `pnpm test`
Expected: PASS, 3 tests.

- [ ] **Step 11: Verify the dev server renders**

Run: `pnpm dev` and open http://localhost:3000. Expected: the default Next.js page on a dark background (Mantine's dark scheme applied). Stop the server.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js, Mantine and Vitest"
```

---

### Task 2: Capture API fixtures and write Zod schemas

**Files:**
- Create: `lib/fpl/fixtures/bootstrap.json`, `lib/fpl/fixtures/standings.json`, `lib/fpl/fixtures/history.json`, `lib/fpl/schemas.ts`, `lib/fpl/schemas.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `bootstrapSchema`, type `Bootstrap` with `events: GameweekEvent[]`
  - `GameweekEvent` = `{ id: number; name: string; deadline_time: string; finished: boolean; data_checked: boolean; is_current: boolean; is_next: boolean; is_previous: boolean }`
  - `leagueStandingsSchema`, type `LeagueStandings`
  - `entryHistorySchema`, type `EntryHistory` with `current: GameweekEntry[]`
  - `GameweekEntry` = `{ event: number; points: number; event_transfers_cost: number; total_points: number; points_on_bench: number }`

- [ ] **Step 1: Capture real fixtures from the live API**

Schemas are validated against recorded reality, not against guesses. `bootstrap-static` is ~1.5MB, so only the `events` array is kept.

```bash
mkdir -p lib/fpl/fixtures
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
curl -s -H "User-Agent: $UA" "https://fantasy.premierleague.com/api/bootstrap-static/" \
  | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);console.log(JSON.stringify({events:b.events},null,2))})" \
  > lib/fpl/fixtures/bootstrap.json
curl -s -H "User-Agent: $UA" "https://fantasy.premierleague.com/api/leagues-classic/79294/standings/" \
  > lib/fpl/fixtures/standings.json
curl -s -H "User-Agent: $UA" "https://fantasy.premierleague.com/api/entry/394534/history/" \
  > lib/fpl/fixtures/history.json
```

- [ ] **Step 2: Write the failing schema tests**

Create `lib/fpl/schemas.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import bootstrapFixture from './fixtures/bootstrap.json';
import historyFixture from './fixtures/history.json';
import standingsFixture from './fixtures/standings.json';
import { bootstrapSchema, entryHistorySchema, leagueStandingsSchema } from './schemas';

describe('bootstrapSchema', () => {
  it('parses the recorded bootstrap fixture', () => {
    const parsed = bootstrapSchema.parse(bootstrapFixture);
    expect(parsed.events).toHaveLength(38);
  });

  it('exposes the flags that decide whether a gameweek is settled', () => {
    const parsed = bootstrapSchema.parse(bootstrapFixture);
    const first = parsed.events[0];
    expect(typeof first.finished).toBe('boolean');
    expect(typeof first.data_checked).toBe('boolean');
    expect(typeof first.deadline_time).toBe('string');
  });
});

describe('leagueStandingsSchema', () => {
  it('parses the recorded standings fixture', () => {
    const parsed = leagueStandingsSchema.parse(standingsFixture);
    expect(parsed.league.id).toBe(79294);
  });

  it('keeps both member arrays, either of which may be empty', () => {
    const parsed = leagueStandingsSchema.parse(standingsFixture);
    const total = parsed.standings.results.length + parsed.new_entries.results.length;
    expect(total).toBe(7);
  });
});

describe('entryHistorySchema', () => {
  it('parses the recorded history fixture', () => {
    const parsed = entryHistorySchema.parse(historyFixture);
    expect(Array.isArray(parsed.current)).toBe(true);
  });

  it('tolerates an empty current array before the season starts', () => {
    const parsed = entryHistorySchema.parse({ current: [] });
    expect(parsed.current).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test lib/fpl/schemas.test.ts`
Expected: FAIL — cannot resolve `./schemas`.

- [ ] **Step 4: Write the schemas**

Create `lib/fpl/schemas.ts`. Only fields actually used are modelled; Zod ignores unknown keys by default, which keeps the schemas resilient to FPL adding fields.

```ts
import { z } from 'zod';

export const gameweekEventSchema = z.object({
  id: z.number(),
  name: z.string(),
  deadline_time: z.string(),
  finished: z.boolean(),
  data_checked: z.boolean(),
  is_current: z.boolean(),
  is_next: z.boolean(),
  is_previous: z.boolean(),
});

export const bootstrapSchema = z.object({
  events: z.array(gameweekEventSchema),
});

/** A member who has played at least one scored gameweek. */
export const standingsRowSchema = z.object({
  entry: z.number(),
  entry_name: z.string(),
  player_name: z.string(),
});

/**
 * A member who has joined but not yet played a scored gameweek. Before the
 * league's first scored gameweek every member appears here instead, and the
 * name is split across two fields rather than one.
 */
export const newEntryRowSchema = z.object({
  entry: z.number(),
  entry_name: z.string(),
  player_first_name: z.string(),
  player_last_name: z.string(),
});

export const leagueStandingsSchema = z.object({
  league: z.object({
    id: z.number(),
    name: z.string(),
    start_event: z.number(),
  }),
  standings: z.object({
    results: z.array(standingsRowSchema),
  }),
  new_entries: z.object({
    results: z.array(newEntryRowSchema),
  }),
});

export const gameweekEntrySchema = z.object({
  event: z.number(),
  points: z.number(),
  event_transfers_cost: z.number(),
  total_points: z.number(),
  points_on_bench: z.number(),
});

export const entryHistorySchema = z.object({
  current: z.array(gameweekEntrySchema),
});

export type GameweekEvent = z.infer<typeof gameweekEventSchema>;
export type Bootstrap = z.infer<typeof bootstrapSchema>;
export type StandingsRow = z.infer<typeof standingsRowSchema>;
export type NewEntryRow = z.infer<typeof newEntryRowSchema>;
export type LeagueStandings = z.infer<typeof leagueStandingsSchema>;
export type GameweekEntry = z.infer<typeof gameweekEntrySchema>;
export type EntryHistory = z.infer<typeof entryHistorySchema>;
```

- [ ] **Step 5: Enable JSON imports in TypeScript**

Add to `compilerOptions` in `tsconfig.json`:

```json
"resolveJsonModule": true
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test lib/fpl/schemas.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add FPL Zod schemas validated against recorded fixtures"
```

---

### Task 3: FPL client

**Files:**
- Create: `lib/fpl/client.ts`, `lib/fpl/client.test.ts`

**Interfaces:**
- Consumes: `FPL_BASE`, `FPL_USER_AGENT`, `LEAGUE_ID` from `lib/config.ts`; all schemas from `lib/fpl/schemas.ts`.
- Produces:
  - `fetchBootstrap(revalidate: number): Promise<Bootstrap>`
  - `fetchStandings(revalidate: number): Promise<LeagueStandings>`
  - `fetchHistory(entryId: number, revalidate: number): Promise<EntryHistory>`

Native `fetch` is used rather than `wretch` because Next.js instruments the global `fetch` for ISR, and the `next: { revalidate }` option is passed directly. This is a deliberate deviation from the usual house preference for `wretch`.

- [ ] **Step 1: Write the failing tests**

Create `lib/fpl/client.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBootstrap, fetchHistory } from './client';

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(body: unknown, ok = true) {
  const spy = vi.fn().mockResolvedValue({
    ok,
    status: ok ? 200 : 503,
    json: async () => body,
  });
  vi.stubGlobal('fetch', spy);
  return spy;
}

describe('fetchBootstrap', () => {
  it('sends a browser User-Agent', async () => {
    const spy = stubFetch({ events: [] });
    await fetchBootstrap(60);
    const [, init] = spy.mock.calls[0];
    expect(init.headers['User-Agent']).toContain('Mozilla/5.0');
  });

  it('passes the revalidate window to Next', async () => {
    const spy = stubFetch({ events: [] });
    await fetchBootstrap(3600);
    const [, init] = spy.mock.calls[0];
    expect(init.next).toEqual({ revalidate: 3600 });
  });

  it('throws when the response is not ok', async () => {
    stubFetch({}, false);
    await expect(fetchBootstrap(60)).rejects.toThrow('FPL request failed');
  });

  it('throws when the payload does not match the schema', async () => {
    stubFetch({ events: [{ id: 'not-a-number' }] });
    await expect(fetchBootstrap(60)).rejects.toThrow();
  });
});

describe('fetchHistory', () => {
  it('requests the entry history path', async () => {
    const spy = stubFetch({ current: [] });
    await fetchHistory(394534, 60);
    const [url] = spy.mock.calls[0];
    expect(url).toBe('https://fantasy.premierleague.com/api/entry/394534/history/');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/fpl/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 3: Write the client**

Create `lib/fpl/client.ts`:

```ts
import { FPL_BASE, FPL_USER_AGENT, LEAGUE_ID } from '@/lib/config';
import type { z } from 'zod';
import {
  bootstrapSchema,
  entryHistorySchema,
  leagueStandingsSchema,
  type Bootstrap,
  type EntryHistory,
  type LeagueStandings,
} from './schemas';

async function fetchAndParse<T extends z.ZodTypeAny>(
  path: string,
  schema: T,
  revalidate: number,
): Promise<z.infer<T>> {
  const url = `${FPL_BASE}${path}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': FPL_USER_AGENT },
    next: { revalidate },
  });

  if (!response.ok) {
    throw new Error(`FPL request failed: ${path} returned ${response.status}`);
  }

  return schema.parse(await response.json());
}

export function fetchBootstrap(revalidate: number): Promise<Bootstrap> {
  return fetchAndParse('/bootstrap-static/', bootstrapSchema, revalidate);
}

export function fetchStandings(revalidate: number): Promise<LeagueStandings> {
  return fetchAndParse(
    `/leagues-classic/${LEAGUE_ID}/standings/`,
    leagueStandingsSchema,
    revalidate,
  );
}

export function fetchHistory(entryId: number, revalidate: number): Promise<EntryHistory> {
  return fetchAndParse(`/entry/${entryId}/history/`, entryHistorySchema, revalidate);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/fpl/client.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add validated FPL client with ISR revalidation"
```

---

### Task 4: Member resolver

**Files:**
- Create: `lib/league/members.ts`, `lib/league/members.test.ts`

**Interfaces:**
- Consumes: `LeagueStandings`, `StandingsRow`, `NewEntryRow` from `lib/fpl/schemas.ts`.
- Produces:
  - `interface Member { entryId: number; managerName: string; teamName: string }`
  - `resolveMembers(standings: LeagueStandings): Member[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/league/members.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { LeagueStandings } from '@/lib/fpl/schemas';
import { resolveMembers } from './members';

function standings(overrides: Partial<LeagueStandings>): LeagueStandings {
  return {
    league: { id: 79294, name: 'Evicted', start_event: 1 },
    standings: { results: [] },
    new_entries: { results: [] },
    ...overrides,
  };
}

describe('resolveMembers', () => {
  it('reads members from new_entries before the first scored gameweek', () => {
    const members = resolveMembers(
      standings({
        new_entries: {
          results: [
            {
              entry: 567357,
              entry_name: 'DEFCON',
              player_first_name: 'Finn',
              player_last_name: 'Taylor',
            },
          ],
        },
      }),
    );

    expect(members).toEqual([
      { entryId: 567357, managerName: 'Finn Taylor', teamName: 'DEFCON' },
    ]);
  });

  it('reads members from standings once gameweeks are scored', () => {
    const members = resolveMembers(
      standings({
        standings: {
          results: [
            { entry: 394534, entry_name: 'Høgh are you?', player_name: 'Alex McGuiness' },
          ],
        },
      }),
    );

    expect(members).toEqual([
      { entryId: 394534, managerName: 'Alex McGuiness', teamName: 'Høgh are you?' },
    ]);
  });

  it('merges both arrays when a new member joins a running league', () => {
    const members = resolveMembers(
      standings({
        standings: {
          results: [
            { entry: 394534, entry_name: 'Høgh are you?', player_name: 'Alex McGuiness' },
          ],
        },
        new_entries: {
          results: [
            {
              entry: 926697,
              entry_name: 'Durán Durán',
              player_first_name: 'Aidan',
              player_last_name: 'McGuiness',
            },
          ],
        },
      }),
    );

    expect(members.map((m) => m.entryId).sort()).toEqual([394534, 926697]);
  });

  it('does not duplicate a member present in both arrays', () => {
    const members = resolveMembers(
      standings({
        standings: {
          results: [
            { entry: 394534, entry_name: 'Høgh are you?', player_name: 'Alex McGuiness' },
          ],
        },
        new_entries: {
          results: [
            {
              entry: 394534,
              entry_name: 'Høgh are you?',
              player_first_name: 'Alex',
              player_last_name: 'McGuiness',
            },
          ],
        },
      }),
    );

    expect(members).toHaveLength(1);
  });

  it('returns an empty list for an empty league', () => {
    expect(resolveMembers(standings({}))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/league/members.test.ts`
Expected: FAIL — cannot resolve `./members`.

- [ ] **Step 3: Write the resolver**

Create `lib/league/members.ts`:

```ts
import type { LeagueStandings } from '@/lib/fpl/schemas';

export interface Member {
  entryId: number;
  managerName: string;
  teamName: string;
}

/**
 * FPL reports league members in two different arrays with two different name
 * shapes. Before a league's first scored gameweek everyone sits in
 * `new_entries`; afterwards they move to `standings`. A league that gains a
 * member mid-season has both populated at once.
 */
export function resolveMembers(standings: LeagueStandings): Member[] {
  const byEntryId = new Map<number, Member>();

  for (const row of standings.standings.results) {
    byEntryId.set(row.entry, {
      entryId: row.entry,
      managerName: row.player_name,
      teamName: row.entry_name,
    });
  }

  for (const row of standings.new_entries.results) {
    if (byEntryId.has(row.entry)) continue;
    byEntryId.set(row.entry, {
      entryId: row.entry,
      managerName: `${row.player_first_name} ${row.player_last_name}`,
      teamName: row.entry_name,
    });
  }

  return [...byEntryId.values()];
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/league/members.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: resolve league members from both standings and new_entries"
```

---

### Task 5: Scoring

**Files:**
- Create: `lib/league/scoring.ts`, `lib/league/scoring.test.ts`

**Interfaces:**
- Consumes: `EntryHistory` from `lib/fpl/schemas.ts`.
- Produces:
  - `interface GameweekScore { entryId: number; gross: number; hits: number; net: number }`
  - `scoresForGameweek(histories: Map<number, EntryHistory>, gameweek: number): GameweekScore[]`
  - `findLosers(scores: GameweekScore[]): number[]`

This module holds every rule the group could argue about. It performs no I/O and is tested without mocks.

- [ ] **Step 1: Write the failing tests**

Create `lib/league/scoring.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { EntryHistory } from '@/lib/fpl/schemas';
import { findLosers, scoresForGameweek } from './scoring';

function history(
  entries: Array<{ event: number; points: number; hits?: number }>,
): EntryHistory {
  return {
    current: entries.map((e) => ({
      event: e.event,
      points: e.points,
      event_transfers_cost: e.hits ?? 0,
      total_points: e.points,
      points_on_bench: 0,
    })),
  };
}

describe('scoresForGameweek', () => {
  it('subtracts transfer hits from gross points', () => {
    const histories = new Map([[1, history([{ event: 5, points: 34, hits: 4 }])]]);
    expect(scoresForGameweek(histories, 5)).toEqual([
      { entryId: 1, gross: 34, hits: 4, net: 30 },
    ]);
  });

  it('leaves a score untouched when no hits were taken', () => {
    const histories = new Map([[1, history([{ event: 5, points: 62 }])]]);
    expect(scoresForGameweek(histories, 5)[0].net).toBe(62);
  });

  it('skips managers with no entry for that gameweek', () => {
    const histories = new Map([
      [1, history([{ event: 5, points: 40 }])],
      [2, history([{ event: 6, points: 40 }])],
    ]);
    expect(scoresForGameweek(histories, 5).map((s) => s.entryId)).toEqual([1]);
  });

  it('returns an empty list when nobody has played the gameweek', () => {
    const histories = new Map([[1, history([])]]);
    expect(scoresForGameweek(histories, 5)).toEqual([]);
  });
});

describe('findLosers', () => {
  it('returns the single lowest net scorer', () => {
    const losers = findLosers([
      { entryId: 1, gross: 50, hits: 0, net: 50 },
      { entryId: 2, gross: 34, hits: 4, net: 30 },
      { entryId: 3, gross: 45, hits: 0, net: 45 },
    ]);
    expect(losers).toEqual([2]);
  });

  it('returns every manager tied at the bottom', () => {
    const losers = findLosers([
      { entryId: 1, gross: 30, hits: 0, net: 30 },
      { entryId: 2, gross: 34, hits: 4, net: 30 },
      { entryId: 3, gross: 45, hits: 0, net: 45 },
    ]);
    expect(losers.sort()).toEqual([1, 2]);
  });

  it('picks the manager whose hits dragged them below a lower gross scorer', () => {
    const losers = findLosers([
      { entryId: 1, gross: 40, hits: 12, net: 28 },
      { entryId: 2, gross: 32, hits: 0, net: 32 },
    ]);
    expect(losers).toEqual([1]);
  });

  it('handles negative net scores', () => {
    const losers = findLosers([
      { entryId: 1, gross: 2, hits: 8, net: -6 },
      { entryId: 2, gross: 10, hits: 0, net: 10 },
    ]);
    expect(losers).toEqual([1]);
  });

  it('returns an empty list when there are no scores', () => {
    expect(findLosers([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/league/scoring.test.ts`
Expected: FAIL — cannot resolve `./scoring`.

- [ ] **Step 3: Write the scoring module**

Create `lib/league/scoring.ts`:

```ts
import type { EntryHistory } from '@/lib/fpl/schemas';

export interface GameweekScore {
  entryId: number;
  gross: number;
  hits: number;
  net: number;
}

/**
 * Net score for every manager who played the given gameweek.
 *
 * Managers absent from a gameweek are omitted rather than scored as zero: a
 * manager who joined the league in GW10 is not liable for GW1 to GW9.
 */
export function scoresForGameweek(
  histories: Map<number, EntryHistory>,
  gameweek: number,
): GameweekScore[] {
  const scores: GameweekScore[] = [];

  for (const [entryId, history] of histories) {
    const entry = history.current.find((e) => e.event === gameweek);
    if (!entry) continue;

    scores.push({
      entryId,
      gross: entry.points,
      hits: entry.event_transfers_cost,
      net: entry.points - entry.event_transfers_cost,
    });
  }

  return scores;
}

/**
 * The entry ids of every manager tied at the lowest net score.
 *
 * Ties are deliberately not broken — everyone level at the bottom pays. This
 * is the single place that rule lives; changing it is a one-function edit.
 */
export function findLosers(scores: GameweekScore[]): number[] {
  if (scores.length === 0) return [];

  const lowest = Math.min(...scores.map((s) => s.net));
  return scores.filter((s) => s.net === lowest).map((s) => s.entryId);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/league/scoring.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add net scoring and tie-inclusive loser selection"
```

---

### Task 6: Gameweek state and the pre-season view

**Files:**
- Create: `lib/league/gameweeks.ts`, `lib/league/gameweeks.test.ts`, `app/components/PreSeason.tsx`, `app/components/PreSeason.module.scss`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `Bootstrap`, `GameweekEvent` from `lib/fpl/schemas.ts`; `fetchBootstrap`, `fetchStandings` from `lib/fpl/client.ts`; `resolveMembers`, `Member` from `lib/league/members.ts`.
- Produces:
  - `settledGameweeks(bootstrap: Bootstrap): number[]`
  - `currentGameweek(bootstrap: Bootstrap): GameweekEvent | null`
  - `nextGameweek(bootstrap: Bootstrap): GameweekEvent | null`
  - `revalidateFor(bootstrap: Bootstrap): number`

This task closes spec phase 1: the site renders the real seven members and the GW1 deadline.

- [ ] **Step 1: Write the failing tests**

Create `lib/league/gameweeks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Bootstrap, GameweekEvent } from '@/lib/fpl/schemas';
import { currentGameweek, nextGameweek, revalidateFor, settledGameweeks } from './gameweeks';

function event(id: number, overrides: Partial<GameweekEvent> = {}): GameweekEvent {
  return {
    id,
    name: `Gameweek ${id}`,
    deadline_time: '2026-08-21T17:30:00Z',
    finished: false,
    data_checked: false,
    is_current: false,
    is_next: false,
    is_previous: false,
    ...overrides,
  };
}

function bootstrap(events: GameweekEvent[]): Bootstrap {
  return { events };
}

describe('settledGameweeks', () => {
  it('requires both finished and data_checked', () => {
    const b = bootstrap([
      event(1, { finished: true, data_checked: true }),
      event(2, { finished: true, data_checked: false }),
      event(3, { finished: false, data_checked: false }),
    ]);
    expect(settledGameweeks(b)).toEqual([1]);
  });

  it('returns them in ascending order', () => {
    const b = bootstrap([
      event(3, { finished: true, data_checked: true }),
      event(1, { finished: true, data_checked: true }),
    ]);
    expect(settledGameweeks(b)).toEqual([1, 3]);
  });

  it('is empty before the season starts', () => {
    expect(settledGameweeks(bootstrap([event(1)]))).toEqual([]);
  });
});

describe('currentGameweek', () => {
  it('returns the event flagged is_current', () => {
    const b = bootstrap([event(1), event(2, { is_current: true })]);
    expect(currentGameweek(b)?.id).toBe(2);
  });

  it('returns null before the season starts', () => {
    expect(currentGameweek(bootstrap([event(1)]))).toBeNull();
  });
});

describe('nextGameweek', () => {
  it('returns the event flagged is_next', () => {
    const b = bootstrap([event(1, { is_next: true }), event(2)]);
    expect(nextGameweek(b)?.id).toBe(1);
  });
});

describe('revalidateFor', () => {
  it('refreshes every minute while a gameweek is live', () => {
    const b = bootstrap([event(1, { is_current: true, finished: false })]);
    expect(revalidateFor(b)).toBe(60);
  });

  it('backs off to an hour once the current gameweek is checked', () => {
    const b = bootstrap([
      event(1, { is_current: true, finished: true, data_checked: true }),
    ]);
    expect(revalidateFor(b)).toBe(3600);
  });

  it('backs off to an hour before the season starts', () => {
    expect(revalidateFor(bootstrap([event(1)]))).toBe(3600);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/league/gameweeks.test.ts`
Expected: FAIL — cannot resolve `./gameweeks`.

- [ ] **Step 3: Write the gameweek module**

Create `lib/league/gameweeks.ts`:

```ts
import type { Bootstrap, GameweekEvent } from '@/lib/fpl/schemas';

export const REVALIDATE_LIVE = 60;
export const REVALIDATE_SETTLED = 3600;

/**
 * Gameweeks whose results are final.
 *
 * `finished` alone is not enough: bonus points and auto-substitutions land
 * afterwards, and they move the bottom of the table. Only `data_checked`
 * means the score will not change again.
 */
export function settledGameweeks(bootstrap: Bootstrap): number[] {
  return bootstrap.events
    .filter((e) => e.finished && e.data_checked)
    .map((e) => e.id)
    .sort((a, b) => a - b);
}

export function currentGameweek(bootstrap: Bootstrap): GameweekEvent | null {
  return bootstrap.events.find((e) => e.is_current) ?? null;
}

export function nextGameweek(bootstrap: Bootstrap): GameweekEvent | null {
  return bootstrap.events.find((e) => e.is_next) ?? null;
}

/** Poll hard only while scores are actually moving. */
export function revalidateFor(bootstrap: Bootstrap): number {
  const current = currentGameweek(bootstrap);
  if (!current) return REVALIDATE_SETTLED;
  return current.data_checked ? REVALIDATE_SETTLED : REVALIDATE_LIVE;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/league/gameweeks.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Write the pre-season styles**

Create `app/components/PreSeason.module.scss`. `mantine` is available without an
import — `additionalData` injects it.

```scss
.title {
  font-size: mantine.rem(40);
  font-weight: 900;
  letter-spacing: mantine.rem(-1);
  text-transform: uppercase;

  @include mantine.smaller-than($mantine-breakpoint-sm) {
    font-size: mantine.rem(32);
  }
}

.deadlineCard {
  border-color: var(--mantine-color-red-8);
}

.deadlineValue {
  font-variant-numeric: tabular-nums;
}

.memberCard {
  transition: border-color 150ms ease;

  @include mantine.hover {
    border-color: var(--mantine-color-red-6);
  }
}
```

- [ ] **Step 6: Write the pre-season component**

Create `app/components/PreSeason.tsx`:

```tsx
import { Badge, Card, Group, Stack, Text, Title } from '@mantine/core';
import type { Member } from '@/lib/league/members';
import classes from './PreSeason.module.scss';

export function PreSeason({
  members,
  deadline,
  gameweekName,
}: {
  members: Member[];
  deadline: string | null;
  gameweekName: string | null;
}) {
  return (
    <Stack gap="lg">
      <div>
        <Title order={1} className={classes.title}>
          Evicted
        </Title>
        <Text c="dimmed" size="sm">
          Nobody has been evicted yet. {gameweekName ?? 'The season'} has not been played.
        </Text>
      </div>

      {deadline && (
        <Card withBorder padding="md" className={classes.deadlineCard}>
          <Text size="sm" c="dimmed">
            {gameweekName} deadline
          </Text>
          <Text size="xl" fw={700} className={classes.deadlineValue}>
            {new Date(deadline).toLocaleString('en-GB', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>
        </Card>
      )}

      <Stack gap="xs">
        <Text fw={600} size="sm" tt="uppercase" c="dimmed">
          {members.length} in the league
        </Text>
        {members.map((member) => (
          <Card key={member.entryId} withBorder padding="sm" className={classes.memberCard}>
            <Group justify="space-between" wrap="nowrap">
              <div>
                <Text fw={600}>{member.teamName}</Text>
                <Text size="sm" c="dimmed">
                  {member.managerName}
                </Text>
              </div>
              <Badge variant="light" color="gray">
                &mdash;
              </Badge>
            </Group>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
```

- [ ] **Step 7: Wire the home page**

Replace `app/page.tsx` entirely:

```tsx
import { Container } from '@mantine/core';
import { fetchBootstrap, fetchStandings } from '@/lib/fpl/client';
import { nextGameweek, revalidateFor } from '@/lib/league/gameweeks';
import { resolveMembers } from '@/lib/league/members';
import { PreSeason } from './components/PreSeason';

export default async function HomePage() {
  const bootstrap = await fetchBootstrap(3600);
  const revalidate = revalidateFor(bootstrap);
  const standings = await fetchStandings(revalidate);
  const members = resolveMembers(standings);
  const next = nextGameweek(bootstrap);

  return (
    <Container size="sm" py="xl">
      <PreSeason
        members={members}
        deadline={next?.deadline_time ?? null}
        gameweekName={next?.name ?? null}
      />
    </Container>
  );
}
```

- [ ] **Step 8: Verify against the live API**

Run `pnpm dev` and open http://localhost:3000.
Expected: the heading "Evicted", the GW1 deadline rendered as a readable date, and all seven managers listed with their team names — Høgh are you?, Jacquet Potato, Borussia Teeth, Red Djed Redemption, Durán Durán, JT, DEFCON. Stop the server.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: render pre-season member list and GW1 deadline"
```

---

### Task 7: Current gameweek view

**Files:**
- Create: `app/components/LoserCard.tsx`, `app/components/LoserCard.module.scss`, `lib/league/summary.ts`, `lib/league/summary.test.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: everything from Tasks 3–6.
- Produces:
  - `interface LoserSummary { gameweek: number; provisional: boolean; losers: Array<{ member: Member; score: GameweekScore }> }`
  - `buildSummary(params: { gameweek: number; provisional: boolean; members: Member[]; scores: GameweekScore[] }): LoserSummary`

- [ ] **Step 1: Write the failing tests**

Create `lib/league/summary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildSummary } from './summary';

const members = [
  { entryId: 1, managerName: 'Finn Taylor', teamName: 'DEFCON' },
  { entryId: 2, managerName: 'Joe Taylor', teamName: 'JT' },
];

describe('buildSummary', () => {
  it('pairs each loser with their member record', () => {
    const summary = buildSummary({
      gameweek: 5,
      provisional: false,
      members,
      scores: [
        { entryId: 1, gross: 34, hits: 4, net: 30 },
        { entryId: 2, gross: 55, hits: 0, net: 55 },
      ],
    });

    expect(summary.losers).toHaveLength(1);
    expect(summary.losers[0].member.teamName).toBe('DEFCON');
    expect(summary.losers[0].score.net).toBe(30);
  });

  it('includes every tied manager', () => {
    const summary = buildSummary({
      gameweek: 5,
      provisional: false,
      members,
      scores: [
        { entryId: 1, gross: 30, hits: 0, net: 30 },
        { entryId: 2, gross: 34, hits: 4, net: 30 },
      ],
    });

    expect(summary.losers).toHaveLength(2);
  });

  it('drops losers with no matching member record', () => {
    const summary = buildSummary({
      gameweek: 5,
      provisional: false,
      members,
      scores: [{ entryId: 99, gross: 10, hits: 0, net: 10 }],
    });

    expect(summary.losers).toEqual([]);
  });

  it('carries the provisional flag through', () => {
    const summary = buildSummary({
      gameweek: 5,
      provisional: true,
      members,
      scores: [{ entryId: 1, gross: 30, hits: 0, net: 30 }],
    });

    expect(summary.provisional).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/league/summary.test.ts`
Expected: FAIL — cannot resolve `./summary`.

- [ ] **Step 3: Write the summary module**

Create `lib/league/summary.ts`:

```ts
import type { Member } from './members';
import { findLosers, type GameweekScore } from './scoring';

export interface LoserSummary {
  gameweek: number;
  provisional: boolean;
  losers: Array<{ member: Member; score: GameweekScore }>;
}

export function buildSummary(params: {
  gameweek: number;
  provisional: boolean;
  members: Member[];
  scores: GameweekScore[];
}): LoserSummary {
  const { gameweek, provisional, members, scores } = params;
  const membersById = new Map(members.map((m) => [m.entryId, m]));
  const scoresById = new Map(scores.map((s) => [s.entryId, s]));

  const losers = findLosers(scores).flatMap((entryId) => {
    const member = membersById.get(entryId);
    const score = scoresById.get(entryId);
    if (!member || !score) return [];
    return [{ member, score }];
  });

  return { gameweek, provisional, losers };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/league/summary.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 5: Write the loser card styles**

Create `app/components/LoserCard.module.scss`:

```scss
.gameweek {
  letter-spacing: mantine.rem(1);
}

.heading {
  font-size: mantine.rem(48);
  font-weight: 900;
  line-height: 1;
  letter-spacing: mantine.rem(-2);
  text-transform: uppercase;

  @include mantine.smaller-than($mantine-breakpoint-sm) {
    font-size: mantine.rem(36);
  }
}

.card {
  border-width: mantine.rem(2);
  border-color: var(--mantine-color-red-8);

  @include mantine.dark {
    background-color: var(--mantine-color-dark-8);
  }
}

.teamName {
  font-size: mantine.rem(28);
  line-height: 1.1;

  @include mantine.smaller-than($mantine-breakpoint-sm) {
    font-size: mantine.rem(22);
  }
}

.score {
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 6: Write the loser card**

Create `app/components/LoserCard.tsx`:

```tsx
import { Alert, Badge, Card, Group, Stack, Text, Title } from '@mantine/core';
import type { LoserSummary } from '@/lib/league/summary';
import classes from './LoserCard.module.scss';

export function LoserCard({ summary }: { summary: LoserSummary }) {
  return (
    <Stack gap="md">
      <div>
        <Text size="sm" c="dimmed" tt="uppercase" fw={600} className={classes.gameweek}>
          Gameweek {summary.gameweek}
        </Text>
        <Title order={1} className={classes.heading}>
          {summary.losers.length > 1 ? 'Evicted' : 'Evictee'}
        </Title>
      </div>

      {summary.provisional && (
        <Alert color="yellow" variant="light" title="Provisional">
          Bonus points and auto-substitutions have not been applied yet. The bottom
          spot can still change.
        </Alert>
      )}

      {summary.losers.map(({ member, score }) => (
        <Card key={member.entryId} withBorder padding="lg" className={classes.card}>
          <Group justify="space-between" align="flex-start" wrap="nowrap">
            <div>
              <Text fw={800} className={classes.teamName}>
                {member.teamName}
              </Text>
              <Text c="dimmed">{member.managerName}</Text>
            </div>
            <Badge size="lg" color="red" variant="filled" className={classes.score}>
              {score.net} pts
            </Badge>
          </Group>

          <Group gap="lg" mt="md">
            <Text size="sm" c="dimmed">
              Gross {score.gross}
            </Text>
            <Text size="sm" c={score.hits > 0 ? 'red' : 'dimmed'}>
              Hits &minus;{score.hits}
            </Text>
          </Group>
        </Card>
      ))}
    </Stack>
  );
}
```

- [ ] **Step 7: Wire the home page to show live results when they exist**

Replace `app/page.tsx` entirely:

```tsx
import { Container } from '@mantine/core';
import { fetchBootstrap, fetchHistory, fetchStandings } from '@/lib/fpl/client';
import { currentGameweek, nextGameweek, revalidateFor } from '@/lib/league/gameweeks';
import { resolveMembers } from '@/lib/league/members';
import { scoresForGameweek } from '@/lib/league/scoring';
import { buildSummary } from '@/lib/league/summary';
import { LoserCard } from './components/LoserCard';
import { PreSeason } from './components/PreSeason';

export default async function HomePage() {
  const bootstrap = await fetchBootstrap(3600);
  const revalidate = revalidateFor(bootstrap);
  const standings = await fetchStandings(revalidate);
  const members = resolveMembers(standings);
  const current = currentGameweek(bootstrap);

  if (!current) {
    const next = nextGameweek(bootstrap);
    return (
      <Container size="sm" py="xl">
        <PreSeason
          members={members}
          deadline={next?.deadline_time ?? null}
          gameweekName={next?.name ?? null}
        />
      </Container>
    );
  }

  const histories = new Map(
    await Promise.all(
      members.map(
        async (member) =>
          [member.entryId, await fetchHistory(member.entryId, revalidate)] as const,
      ),
    ),
  );

  const summary = buildSummary({
    gameweek: current.id,
    provisional: !current.data_checked,
    members,
    scores: scoresForGameweek(histories, current.id),
  });

  return (
    <Container size="sm" py="xl">
      <LoserCard summary={summary} />
    </Container>
  );
}
```

- [ ] **Step 8: Run the full test suite**

Run: `pnpm test`
Expected: PASS, all tests.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: render the current gameweek evictee with provisional marker"
```

---

### Task 8: Redis store

**Files:**
- Create: `lib/ledger/store.ts`, `lib/ledger/store.test.ts`, `.env.example`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `@upstash/redis`.
- Produces:
  - `interface GameweekResult { losers: number[]; scores: Record<number, number>; recordedAt: string }`
  - `getResults(): Promise<Map<number, GameweekResult>>`
  - `saveResult(gameweek: number, result: GameweekResult): Promise<void>`
  - `getPaid(): Promise<Set<string>>` where members are `` `${gameweek}:${entryId}` ``
  - `setPaid(gameweek: number, entryId: number, paid: boolean): Promise<void>`
  - `paidKey(gameweek: number, entryId: number): string`

- [ ] **Step 1: Provision Upstash**

```bash
pnpm dlx vercel@latest login
pnpm dlx vercel@latest link
pnpm dlx vercel@latest install upstash
pnpm dlx vercel@latest env pull .env.local
```

This injects `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`. Confirm both are present in `.env.local`.

- [ ] **Step 2: Add `.env.example` and ignore local env files**

Create `.env.example`:

```
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
ADMIN_PIN=
```

Confirm `.gitignore` contains `.env` and `.env.*` with a `!.env.example` negation. It already does from the initial commit — verify rather than duplicate.

- [ ] **Step 3: Write the failing tests**

The Upstash client is stubbed so the tests stay offline. Create `lib/ledger/store.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hgetall = vi.fn();
const hset = vi.fn();
const smembers = vi.fn();
const sadd = vi.fn();
const srem = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: class {
    hgetall = hgetall;
    hset = hset;
    smembers = smembers;
    sadd = sadd;
    srem = srem;
  },
}));

const { getPaid, getResults, paidKey, saveResult, setPaid } = await import('./store');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('paidKey', () => {
  it('joins gameweek and entry id', () => {
    expect(paidKey(5, 394534)).toBe('5:394534');
  });
});

describe('getResults', () => {
  it('returns an empty map when nothing is recorded', async () => {
    hgetall.mockResolvedValue(null);
    expect(await getResults()).toEqual(new Map());
  });

  it('keys results by gameweek number', async () => {
    hgetall.mockResolvedValue({
      '5': { losers: [1], scores: { 1: 30 }, recordedAt: '2026-09-01T00:00:00Z' },
    });
    const results = await getResults();
    expect(results.get(5)?.losers).toEqual([1]);
  });
});

describe('saveResult', () => {
  it('writes under the gameweek field', async () => {
    const result = { losers: [1], scores: { 1: 30 }, recordedAt: '2026-09-01T00:00:00Z' };
    await saveResult(5, result);
    expect(hset).toHaveBeenCalledWith('evicted:results', { '5': result });
  });
});

describe('getPaid', () => {
  it('returns a set of composite keys', async () => {
    smembers.mockResolvedValue(['5:394534', '6:567357']);
    const paid = await getPaid();
    expect(paid.has('5:394534')).toBe(true);
    expect(paid.has('7:1')).toBe(false);
  });

  it('returns an empty set when nothing is paid', async () => {
    smembers.mockResolvedValue([]);
    expect(await getPaid()).toEqual(new Set());
  });
});

describe('setPaid', () => {
  it('adds the key when marking paid', async () => {
    await setPaid(5, 394534, true);
    expect(sadd).toHaveBeenCalledWith('evicted:paid', '5:394534');
  });

  it('removes the key when marking unpaid', async () => {
    await setPaid(5, 394534, false);
    expect(srem).toHaveBeenCalledWith('evicted:paid', '5:394534');
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `pnpm test lib/ledger/store.test.ts`
Expected: FAIL — cannot resolve `./store`.

- [ ] **Step 5: Write the store**

Create `lib/ledger/store.ts`:

```ts
import { Redis } from '@upstash/redis';

const RESULTS_KEY = 'evicted:results';
const PAID_KEY = 'evicted:paid';

export interface GameweekResult {
  /** Entry ids of everyone tied at the bottom. */
  losers: number[];
  /** Net score per entry id, kept so the record survives FPL changing its mind. */
  scores: Record<number, number>;
  recordedAt: string;
}

let client: Redis | null = null;

/**
 * Created on first use rather than at import time. `Redis.fromEnv()` throws
 * when the environment variables are absent, which would break `next build`
 * and any test that merely imports this module.
 */
function redisClient(): Redis {
  client ??= Redis.fromEnv();
  return client;
}

export function paidKey(gameweek: number, entryId: number): string {
  return `${gameweek}:${entryId}`;
}

export async function getResults(): Promise<Map<number, GameweekResult>> {
  const raw = await redisClient().hgetall<Record<string, GameweekResult>>(RESULTS_KEY);
  if (!raw) return new Map();
  return new Map(Object.entries(raw).map(([gw, result]) => [Number(gw), result]));
}

/**
 * Results are written once and never rewritten — a settled gameweek does not
 * change.
 */
export async function saveResult(
  gameweek: number,
  result: GameweekResult,
): Promise<void> {
  await redisClient().hset(RESULTS_KEY, { [String(gameweek)]: result });
}

export async function getPaid(): Promise<Set<string>> {
  const members = await redisClient().smembers(PAID_KEY);
  return new Set(members);
}

export async function setPaid(
  gameweek: number,
  entryId: number,
  paid: boolean,
): Promise<void> {
  const key = paidKey(gameweek, entryId);
  if (paid) {
    await redisClient().sadd(PAID_KEY, key);
  } else {
    await redisClient().srem(PAID_KEY, key);
  }
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm test lib/ledger/store.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Upstash Redis store for results and paid state"
```

---

### Task 9: Reconciliation

**Files:**
- Create: `lib/ledger/reconcile.ts`, `lib/ledger/reconcile.test.ts`

**Interfaces:**
- Consumes: `GameweekResult` from `lib/ledger/store.ts`.
- Produces: `gameweeksNeedingRecord(settled: number[], recorded: Iterable<number>): number[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/ledger/reconcile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { gameweeksNeedingRecord } from './reconcile';

describe('gameweeksNeedingRecord', () => {
  it('returns settled gameweeks that have no record', () => {
    expect(gameweeksNeedingRecord([1, 2, 3], [1])).toEqual([2, 3]);
  });

  it('returns nothing when everything is recorded', () => {
    expect(gameweeksNeedingRecord([1, 2], [1, 2])).toEqual([]);
  });

  it('returns nothing before any gameweek settles', () => {
    expect(gameweeksNeedingRecord([], [])).toEqual([]);
  });

  it('fills a multi-week gap oldest first', () => {
    expect(gameweeksNeedingRecord([1, 2, 3, 4, 5], [1, 2])).toEqual([3, 4, 5]);
  });

  it('ignores recorded gameweeks that are not settled', () => {
    expect(gameweeksNeedingRecord([1], [1, 2, 3])).toEqual([]);
  });

  it('sorts ascending even when settled arrives unsorted', () => {
    expect(gameweeksNeedingRecord([5, 3, 4], [])).toEqual([3, 4, 5]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/ledger/reconcile.test.ts`
Expected: FAIL — cannot resolve `./reconcile`.

- [ ] **Step 3: Write the reconcile module**

Create `lib/ledger/reconcile.ts`:

```ts
/**
 * Which settled gameweeks still need a result written, oldest first.
 *
 * Ordering matters: if nobody opens the site for a month, several gameweeks
 * settle at once and must be recorded in the order they were played.
 */
export function gameweeksNeedingRecord(
  settled: number[],
  recorded: Iterable<number>,
): number[] {
  const already = new Set(recorded);
  return settled.filter((gw) => !already.has(gw)).sort((a, b) => a - b);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/ledger/reconcile.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: work out which settled gameweeks still need recording"
```

---

### Task 10: Record settled gameweeks on page load

**Files:**
- Create: `lib/league/record.ts`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `settledGameweeks`, `scoresForGameweek`, `findLosers`, `getResults`, `saveResult`, `gameweeksNeedingRecord`.
- Produces: `recordSettledGameweeks(params: { bootstrap: Bootstrap; histories: Map<number, EntryHistory> }): Promise<Map<number, GameweekResult>>` — returns the full result map including anything just written.

- [ ] **Step 1: Write the recorder**

Create `lib/league/record.ts`:

```ts
import type { Bootstrap, EntryHistory } from '@/lib/fpl/schemas';
import { gameweeksNeedingRecord } from '@/lib/ledger/reconcile';
import { getResults, saveResult, type GameweekResult } from '@/lib/ledger/store';
import { settledGameweeks } from './gameweeks';
import { findLosers, scoresForGameweek } from './scoring';

/**
 * The lazy alternative to a cron. Any gameweek that has settled since the last
 * page view is computed and written now, oldest first. Already-recorded
 * gameweeks are never rewritten.
 */
export async function recordSettledGameweeks(params: {
  bootstrap: Bootstrap;
  histories: Map<number, EntryHistory>;
}): Promise<Map<number, GameweekResult>> {
  const { bootstrap, histories } = params;
  const results = await getResults();
  const pending = gameweeksNeedingRecord(settledGameweeks(bootstrap), results.keys());

  for (const gameweek of pending) {
    const scores = scoresForGameweek(histories, gameweek);
    if (scores.length === 0) continue;

    const result: GameweekResult = {
      losers: findLosers(scores),
      scores: Object.fromEntries(scores.map((s) => [s.entryId, s.net])),
      recordedAt: new Date().toISOString(),
    };

    await saveResult(gameweek, result);
    results.set(gameweek, result);
  }

  return results;
}
```

- [ ] **Step 2: Call it from the home page**

In `app/page.tsx`, add the import:

```tsx
import { recordSettledGameweeks } from '@/lib/league/record';
```

Then insert this line immediately after the `histories` map is built and before `buildSummary` is called:

```tsx
  await recordSettledGameweeks({ bootstrap, histories });
```

- [ ] **Step 3: Force dynamic rendering for the page**

Recording writes to Redis, so the page cannot be statically prerendered at build time. Add to the top of `app/page.tsx`, below the imports:

```tsx
export const dynamic = 'force-dynamic';
```

The FPL fetches keep their own ISR windows, so this does not cause an upstream fetch per visitor.

- [ ] **Step 4: Run the full test suite**

Run: `pnpm test`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: record settled gameweeks lazily on page load"
```

---

### Task 11: Admin toggle

**Files:**
- Create: `app/api/admin/toggle/route.ts`, `app/components/AdminToggle.tsx`, `lib/admin.ts`, `lib/admin.test.ts`
- Modify: `app/components/LoserCard.tsx`, `.env.local`

**Interfaces:**
- Consumes: `setPaid` from `lib/ledger/store.ts`.
- Produces:
  - `checkPin(supplied: string | null): boolean` from `lib/admin.ts`
  - `POST /api/admin/toggle` accepting `{ gameweek: number; entryId: number; paid: boolean }` with an `x-admin-pin` header

- [ ] **Step 1: Set a PIN locally**

Add to `.env.local`:

```
ADMIN_PIN=choose-something-here
```

- [ ] **Step 2: Write the failing tests**

Create `lib/admin.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkPin } from './admin';

const original = process.env.ADMIN_PIN;

beforeEach(() => {
  process.env.ADMIN_PIN = 'correct-horse';
});

afterEach(() => {
  process.env.ADMIN_PIN = original;
});

describe('checkPin', () => {
  it('accepts the configured pin', () => {
    expect(checkPin('correct-horse')).toBe(true);
  });

  it('rejects a wrong pin', () => {
    expect(checkPin('wrong')).toBe(false);
  });

  it('rejects a missing pin', () => {
    expect(checkPin(null)).toBe(false);
  });

  it('rejects a pin of a different length', () => {
    expect(checkPin('correct-horse-battery')).toBe(false);
  });

  it('rejects everything when no pin is configured', () => {
    delete process.env.ADMIN_PIN;
    expect(checkPin('anything')).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm test lib/admin.test.ts`
Expected: FAIL — cannot resolve `./admin`.

- [ ] **Step 4: Write the PIN check**

Create `lib/admin.ts`:

```ts
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
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test lib/admin.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 6: Write the route**

Create `app/api/admin/toggle/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { checkPin } from '@/lib/admin';
import { setPaid } from '@/lib/ledger/store';

const bodySchema = z.object({
  gameweek: z.number().int().min(1).max(38),
  entryId: z.number().int().positive(),
  paid: z.boolean(),
});

export async function POST(request: Request) {
  if (!checkPin(request.headers.get('x-admin-pin'))) {
    return NextResponse.json({ error: 'unauthorised' }, { status: 401 });
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'bad request' }, { status: 400 });
  }

  const { gameweek, entryId, paid } = parsed.data;
  await setPaid(gameweek, entryId, paid);

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 7: Write the toggle component**

Create `app/components/AdminToggle.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@mantine/core';

const PIN_STORAGE_KEY = 'evicted-admin-pin';

export function AdminToggle({
  gameweek,
  entryId,
  paid,
}: {
  gameweek: number;
  entryId: number;
  paid: boolean;
}) {
  const [busy, setBusy] = useState(false);

  async function toggle() {
    let pin = window.localStorage.getItem(PIN_STORAGE_KEY);
    if (!pin) {
      pin = window.prompt('Admin PIN');
      if (!pin) return;
    }

    setBusy(true);
    const response = await fetch('/api/admin/toggle', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-admin-pin': pin },
      body: JSON.stringify({ gameweek, entryId, paid: !paid }),
    });
    setBusy(false);

    if (response.ok) {
      window.localStorage.setItem(PIN_STORAGE_KEY, pin);
      window.location.reload();
      return;
    }

    window.localStorage.removeItem(PIN_STORAGE_KEY);
    window.alert('Rejected. Wrong PIN?');
  }

  return (
    <Button size="xs" variant="subtle" loading={busy} onClick={toggle}>
      Mark {paid ? 'unpaid' : 'paid'}
    </Button>
  );
}
```

The PIN is sent as a header and stored only in `localStorage`. It never enters the URL.

- [ ] **Step 8: Show paid state and the toggle on the loser card**

In `app/components/LoserCard.tsx`, extend the props and render the badge. Replace the component signature and the badge group:

```tsx
import { AdminToggle } from './AdminToggle';

export function LoserCard({
  summary,
  paid,
}: {
  summary: LoserSummary;
  paid: Set<string>;
}) {
```

Inside the `summary.losers.map` callback, after the existing `Group` of gross/hits, add:

```tsx
          <Group justify="space-between" mt="md">
            <Badge color={paid.has(`${summary.gameweek}:${member.entryId}`) ? 'green' : 'red'} variant="light">
              {paid.has(`${summary.gameweek}:${member.entryId}`) ? 'Settled' : 'Owes £2'}
            </Badge>
            <AdminToggle
              gameweek={summary.gameweek}
              entryId={member.entryId}
              paid={paid.has(`${summary.gameweek}:${member.entryId}`)}
            />
          </Group>
```

- [ ] **Step 9: Pass paid state from the page**

In `app/page.tsx`, add the import:

```tsx
import { getPaid } from '@/lib/ledger/store';
```

Fetch it after recording and pass it down:

```tsx
  const paid = await getPaid();
```

```tsx
      <LoserCard summary={summary} paid={paid} />
```

- [ ] **Step 10: Verify end to end**

Run `pnpm dev`. With the season not yet started the pre-season view still shows, so verify the route directly:

```bash
curl -s -X POST http://localhost:3000/api/admin/toggle -H "content-type: application/json" -H "x-admin-pin: wrong" -d '{"gameweek":1,"entryId":394534,"paid":true}'
```

Expected: `{"error":"unauthorised"}` with status 401.

```bash
curl -s -X POST http://localhost:3000/api/admin/toggle -H "content-type: application/json" -H "x-admin-pin: YOUR_PIN" -d '{"gameweek":1,"entryId":394534,"paid":true}'
```

Expected: `{"ok":true}`. Then run it again with `"paid":false` to leave the store clean.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add PIN-gated admin toggle for paid state"
```

---

### Task 12: Balances page

**Files:**
- Create: `lib/league/balances.ts`, `lib/league/balances.test.ts`, `app/balances/page.tsx`, `app/components/BalancesTable.tsx`, `app/components/NavLinks.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `Member`, `GameweekResult`, `FINE_PENCE`, `paidKey`.
- Produces:
  - `interface Balance { member: Member; lost: number[]; unpaid: number[]; owedPence: number; paidPence: number }`
  - `buildBalances(params: { members: Member[]; results: Map<number, GameweekResult>; paid: Set<string> }): Balance[]`

- [ ] **Step 1: Write the failing tests**

Create `lib/league/balances.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildBalances } from './balances';

const members = [
  { entryId: 1, managerName: 'Finn Taylor', teamName: 'DEFCON' },
  { entryId: 2, managerName: 'Joe Taylor', teamName: 'JT' },
];

const results = new Map([
  [1, { losers: [1], scores: { 1: 30 }, recordedAt: '2026-08-24T00:00:00Z' }],
  [2, { losers: [1], scores: { 1: 25 }, recordedAt: '2026-08-31T00:00:00Z' }],
  [3, { losers: [2], scores: { 2: 20 }, recordedAt: '2026-09-07T00:00:00Z' }],
]);

describe('buildBalances', () => {
  it('counts every gameweek a manager lost', () => {
    const balances = buildBalances({ members, results, paid: new Set() });
    const finn = balances.find((b) => b.member.entryId === 1);
    expect(finn?.lost).toEqual([1, 2]);
  });

  it('charges two pounds per unpaid gameweek', () => {
    const balances = buildBalances({ members, results, paid: new Set() });
    expect(balances.find((b) => b.member.entryId === 1)?.owedPence).toBe(400);
  });

  it('moves settled gameweeks from owed to paid', () => {
    const balances = buildBalances({ members, results, paid: new Set(['1:1']) });
    const finn = balances.find((b) => b.member.entryId === 1);
    expect(finn?.owedPence).toBe(200);
    expect(finn?.paidPence).toBe(200);
    expect(finn?.unpaid).toEqual([2]);
  });

  it('gives a manager who has never lost a zero balance', () => {
    const balances = buildBalances({
      members,
      results: new Map(),
      paid: new Set(),
    });
    expect(balances.every((b) => b.owedPence === 0)).toBe(true);
  });

  it('counts both managers when a gameweek was tied', () => {
    const tied = new Map([
      [1, { losers: [1, 2], scores: { 1: 30, 2: 30 }, recordedAt: '2026-08-24T00:00:00Z' }],
    ]);
    const balances = buildBalances({ members, results: tied, paid: new Set() });
    expect(balances.every((b) => b.owedPence === 200)).toBe(true);
  });

  it('orders by amount owed, highest first', () => {
    const balances = buildBalances({ members, results, paid: new Set() });
    expect(balances[0].member.entryId).toBe(1);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/league/balances.test.ts`
Expected: FAIL — cannot resolve `./balances`.

- [ ] **Step 3: Write the balances module**

Create `lib/league/balances.ts`:

```ts
import { FINE_PENCE } from '@/lib/config';
import { paidKey, type GameweekResult } from '@/lib/ledger/store';
import type { Member } from './members';

export interface Balance {
  member: Member;
  /** Gameweeks this manager finished bottom of. */
  lost: number[];
  /** Of those, the ones still unpaid. */
  unpaid: number[];
  owedPence: number;
  paidPence: number;
}

export function buildBalances(params: {
  members: Member[];
  results: Map<number, GameweekResult>;
  paid: Set<string>;
}): Balance[] {
  const { members, results, paid } = params;

  return members
    .map((member) => {
      const lost = [...results.entries()]
        .filter(([, result]) => result.losers.includes(member.entryId))
        .map(([gameweek]) => gameweek)
        .sort((a, b) => a - b);

      const unpaid = lost.filter((gw) => !paid.has(paidKey(gw, member.entryId)));

      return {
        member,
        lost,
        unpaid,
        owedPence: unpaid.length * FINE_PENCE,
        paidPence: (lost.length - unpaid.length) * FINE_PENCE,
      };
    })
    .sort((a, b) => b.owedPence - a.owedPence);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/league/balances.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 5: Write the nav component**

Create `app/components/NavLinks.tsx`:

```tsx
import Link from 'next/link';
import { Group, Anchor } from '@mantine/core';

export function NavLinks() {
  return (
    <Group gap="md" mb="lg">
      <Anchor component={Link} href="/" size="sm">
        This week
      </Anchor>
      <Anchor component={Link} href="/balances" size="sm">
        Balances
      </Anchor>
    </Group>
  );
}
```

- [ ] **Step 6: Write the balances table**

Create `app/components/BalancesTable.module.scss`:

```scss
.table {
  font-variant-numeric: tabular-nums;
}

.owed {
  font-size: mantine.rem(16);
}

.manager {
  min-width: mantine.rem(140);
}
```

Then create `app/components/BalancesTable.tsx`:

```tsx
import { Badge, Table, Text } from '@mantine/core';
import type { Balance } from '@/lib/league/balances';
import classes from './BalancesTable.module.scss';

function pounds(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`;
}

export function BalancesTable({ balances }: { balances: Balance[] }) {
  return (
    <Table striped highlightOnHover className={classes.table}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th className={classes.manager}>Manager</Table.Th>
          <Table.Th ta="right">Lost</Table.Th>
          <Table.Th ta="right">Paid</Table.Th>
          <Table.Th ta="right">Owes</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {balances.map((balance) => (
          <Table.Tr key={balance.member.entryId}>
            <Table.Td>
              <Text fw={600} size="sm">
                {balance.member.teamName}
              </Text>
              <Text size="xs" c="dimmed">
                {balance.member.managerName}
              </Text>
            </Table.Td>
            <Table.Td ta="right">{balance.lost.length}</Table.Td>
            <Table.Td ta="right">
              <Text size="sm" c="dimmed">
                {pounds(balance.paidPence)}
              </Text>
            </Table.Td>
            <Table.Td ta="right">
              {balance.owedPence === 0 ? (
                <Badge color="green" variant="light">
                  Clear
                </Badge>
              ) : (
                <Text fw={700} c="red" className={classes.owed}>
                  {pounds(balance.owedPence)}
                </Text>
              )}
            </Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
```

- [ ] **Step 7: Write the balances page**

Create `app/balances/page.tsx`:

```tsx
import { Container, Text, Title } from '@mantine/core';
import { fetchStandings } from '@/lib/fpl/client';
import { resolveMembers } from '@/lib/league/members';
import { buildBalances } from '@/lib/league/balances';
import { getPaid, getResults } from '@/lib/ledger/store';
import { BalancesTable } from '../components/BalancesTable';
import { NavLinks } from '../components/NavLinks';

export const dynamic = 'force-dynamic';

export default async function BalancesPage() {
  const [standings, results, paid] = await Promise.all([
    fetchStandings(3600),
    getResults(),
    getPaid(),
  ]);

  const balances = buildBalances({
    members: resolveMembers(standings),
    results,
    paid,
  });

  return (
    <Container size="sm" py="xl">
      <NavLinks />
      <Title order={1} mb="xs">
        Balances
      </Title>
      <Text c="dimmed" size="sm" mb="lg">
        £2 per gameweek finished bottom.
      </Text>
      <BalancesTable balances={balances} />
    </Container>
  );
}
```

- [ ] **Step 8: Add the nav to the home page**

In `app/page.tsx`, import `NavLinks` and render `<NavLinks />` as the first child of both `Container` returns:

```tsx
import { NavLinks } from './components/NavLinks';
```

- [ ] **Step 9: Verify**

Run `pnpm dev` and open http://localhost:3000/balances.
Expected: all seven managers listed, every row showing 0 lost and a green "Clear" badge, since no gameweek has settled yet. Navigation between the two pages works.

- [ ] **Step 10: Run the full test suite and lint**

Run: `pnpm test && pnpm lint && pnpm build`
Expected: all tests pass, no lint errors, build succeeds.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: add balances page"
```

---

### Task 13: Degrade gracefully when Redis or FPL is down

Implements spec §6. Payment state must never fail *open* — an unreachable Redis
showing everyone as settled is worse than showing nothing.

**Files:**
- Create: `lib/ledger/safe.ts`, `lib/ledger/safe.test.ts`, `app/error.tsx`
- Modify: `app/page.tsx`, `app/balances/page.tsx`

**Interfaces:**
- Consumes: `getPaid`, `getResults` from `lib/ledger/store.ts`.
- Produces:
  - `safeGetPaid(): Promise<{ paid: Set<string>; degraded: boolean }>`
  - `safeGetResults(): Promise<{ results: Map<number, GameweekResult>; degraded: boolean }>`

- [ ] **Step 1: Write the failing tests**

Create `lib/ledger/safe.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPaid = vi.fn();
const getResults = vi.fn();

vi.mock('./store', () => ({ getPaid, getResults }));

const { safeGetPaid, safeGetResults } = await import('./safe');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('safeGetPaid', () => {
  it('passes the set through when Redis answers', async () => {
    getPaid.mockResolvedValue(new Set(['1:394534']));
    const { paid, degraded } = await safeGetPaid();
    expect(paid.has('1:394534')).toBe(true);
    expect(degraded).toBe(false);
  });

  it('returns an empty set and flags degradation when Redis throws', async () => {
    getPaid.mockRejectedValue(new Error('connection refused'));
    const { paid, degraded } = await safeGetPaid();
    expect(paid.size).toBe(0);
    expect(degraded).toBe(true);
  });
});

describe('safeGetResults', () => {
  it('returns an empty map and flags degradation when Redis throws', async () => {
    getResults.mockRejectedValue(new Error('connection refused'));
    const { results, degraded } = await safeGetResults();
    expect(results.size).toBe(0);
    expect(degraded).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test lib/ledger/safe.test.ts`
Expected: FAIL — cannot resolve `./safe`.

- [ ] **Step 3: Write the safe wrappers**

Create `lib/ledger/safe.ts`:

```ts
import { getPaid, getResults, type GameweekResult } from './store';

/**
 * An unreachable store degrades to "we don't know", never to "settled".
 * Showing a fine as paid when it isn't would take real money out of the pot.
 */
export async function safeGetPaid(): Promise<{ paid: Set<string>; degraded: boolean }> {
  try {
    return { paid: await getPaid(), degraded: false };
  } catch {
    return { paid: new Set(), degraded: true };
  }
}

export async function safeGetResults(): Promise<{
  results: Map<number, GameweekResult>;
  degraded: boolean;
}> {
  try {
    return { results: await getResults(), degraded: false };
  } catch {
    return { results: new Map(), degraded: true };
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test lib/ledger/safe.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Use the safe wrappers in both pages**

In `app/page.tsx`, replace the `getPaid` import and call:

```tsx
import { safeGetPaid } from '@/lib/ledger/safe';
```

```tsx
  const { paid, degraded } = await safeGetPaid();
```

Render a notice above the card when `degraded` is true:

```tsx
      {degraded && (
        <Alert color="orange" variant="light" title="Payment status unavailable">
          Could not reach the payment store. Amounts shown may be out of date.
        </Alert>
      )}
```

Import `Alert` from `@mantine/core` in that file. Apply the same change in
`app/balances/page.tsx`, using `safeGetResults` alongside `safeGetPaid`.

- [ ] **Step 6: Add a route error boundary**

Create `app/error.tsx`. This catches an FPL outage or schema failure, which
throws from the client in Task 3:

```tsx
'use client';

import { Alert, Button, Container, Stack } from '@mantine/core';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <Container size="sm" py="xl">
      <Stack>
        <Alert color="red" title="Could not load the league">
          The Fantasy Premier League API did not respond as expected. This usually
          clears on its own during a busy gameweek.
        </Alert>
        <Button onClick={reset} variant="light">
          Try again
        </Button>
      </Stack>
    </Container>
  );
}
```

- [ ] **Step 7: Verify the degraded path**

Temporarily set `UPSTASH_REDIS_REST_URL` in `.env.local` to `https://example.invalid`,
run `pnpm dev`, and open the site. Expected: the page still renders the league with
the orange "Payment status unavailable" notice rather than an error screen. Restore
the correct value afterwards.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: degrade gracefully when the payment store is unreachable"
```

---

### Task 14: Deploy

**Files:**
- Create: `.claude/launch.json`
- Modify: `README.md`

- [ ] **Step 1: Add the dev server config**

Create `.claude/launch.json` so the app can be previewed without a manual server:

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "evicted",
      "runtimeExecutable": "pnpm",
      "runtimeArgs": ["dev"],
      "port": 3000
    }
  ]
}
```

- [ ] **Step 2: Set production environment variables**

```bash
pnpm dlx vercel@latest env add ADMIN_PIN production
```

Upstash variables were injected automatically when the integration was installed. Confirm with:

```bash
pnpm dlx vercel@latest env ls
```

Expected: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` and `ADMIN_PIN` all present for production.

- [ ] **Step 3: Deploy**

```bash
pnpm dlx vercel@latest --prod
```

- [ ] **Step 4: Verify the deployment**

Open the production URL. Expected: the pre-season view with all seven managers and the GW1 deadline. Check `/balances` renders. Confirm the admin toggle rejects a wrong PIN:

```bash
curl -s -X POST https://YOUR-DEPLOYMENT.vercel.app/api/admin/toggle -H "content-type: application/json" -H "x-admin-pin: wrong" -d '{"gameweek":1,"entryId":394534,"paid":true}'
```

Expected: `{"error":"unauthorised"}`.

- [ ] **Step 5: Record the URL in the README**

Add the production URL under the title in `README.md`.

- [ ] **Step 6: Commit and push**

```bash
git add -A
git commit -m "chore: add launch config and record deployment URL"
git push
```

---

## After this plan

Once GW1 is scored (from 2026-08-22), revisit and confirm against real data:

- The current gameweek view names a real evictee with correct gross, hits and net.
- `settledGameweeks` flips only after `data_checked`, not merely `finished`.
- Members have moved from `new_entries` into `standings` and the resolver handles it.

Then write the phase 4 plan for Monzo reconciliation, which begins by sending £2 from another account and logging the real webhook payload.
