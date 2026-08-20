# Evicted — design

**Date:** 2026-08-19
**Status:** Approved, not yet implemented

A mobile-first dashboard for FPL mini-league `79294` ("Evicted") that identifies the
lowest **net** scorer each gameweek and records whether they have paid their £2 fine.

## 1. Verified facts

Everything below was checked against the live API on 2026-08-19, not assumed.

| Fact | Value |
|---|---|
| Season state | Not started. No `is_current` event, zero finished gameweeks. |
| GW1 deadline | 2026-08-21T17:30:00Z |
| League | `79294`, name "Evicted", `league_type: "x"` (invitational), `start_event: 1` |
| Admin entry | `394534` — Alex McGuiness, "Høgh are you?" |
| Members | **Dynamic.** 7 at first capture, 9 by 15:00 the same day; all in `new_entries.results`, `standings.results` empty |

**Membership is not fixed.** Two managers joined within hours of the first capture and
one renamed their team, all on 2026-08-19. Churn should be expected until the GW1
deadline (2026-08-21T17:30:00Z). Nothing in the app hardcodes the roster — it renders
whatever the API returns — but any document, fixture or test asserting a *count* is a
snapshot, not a fact, and will go stale.

The nine managers as of 2026-08-19:

| Entry | Manager | Team |
|---|---|---|
| 394534 | Alex McGuiness | Høgh are you? |
| 4411759 | Ben Hopla | Jacquet Potato |
| 1406240 | Charlie Robinson | Borussia Teeth |
| 1358366 | Jack Simpson | Red Djed Redemption |
| 926697 | Aidan McGuiness | Durán Durán |
| 597768 | Joe Taylor | JT |
| 567357 | Finn Taylor | ☢️DEFCON Merchant☢️ |
| 6404523 | Struan Hall | Egg Fried Reus |
| 6333176 | Matthew Greenaway | BaldySins |

### Consequences

**Members live in two different arrays.** Before a league's first scored gameweek,
members appear in `new_entries.results` with `player_first_name` / `player_last_name`.
Afterwards they appear in `standings.results` with a single `player_name`. The member
resolver reads both and normalises. Ignoring this shows an empty league until Saturday.

**`entry/{id}/history/` returns the whole season in one request.** Its `current[]`
array carries `points`, `event_transfers_cost`, `total_points` and `points_on_bench`
per gameweek. Seven requests cover the full season for the whole league. The
per-gameweek `entry/{id}/event/{gw}/picks/` loop in the original sketch would have
been 7 × 38.

**`event_total` is never used.** Whether league standings report gross or net is
unverifiable while standings are empty, and irrelevant if net is derived from
`history` as `points - event_transfers_cost`.

**Results are provisional until `data_checked`.** Bonus points and auto-substitutions
land after a gameweek first appears finished. A loser computed on Saturday can be a
different person by Monday, so nothing is written to storage until `bootstrap-static`
reports both `finished` and `data_checked` for that gameweek.

## 2. Rules

- **Loser** — the lowest net score for the gameweek, where net is
  `points - event_transfers_cost`.
- **Ties** — every manager tied at the lowest net score pays. Chosen because it is the
  only rule with no free parameter to argue about. A deterministic single-loser
  fallback exists if the group prefers it (lowest net, then lowest gross, then worse
  overall rank); not implemented.
- **Fine** — £2 per gameweek lost. One exported constant, `FINE_PENCE = 200`.
- **Eligibility** — a manager is eligible from the gameweek during which they joined
  **this league**, derived from the `joined_time` field FPL supplies on each member.

  This corrects a contradiction in an earlier version of this spec, which said both
  "eligible from the first gameweek present in their `history.current[]`" and
  "mid-season joiners are not retroactively fined". Those conflict: `history.current[]`
  starts at the manager's first **FPL** gameweek, not their first gameweek in this
  league. Someone who has played FPL since GW1 but joins this league at GW10 has nine
  gameweeks of history that predate their membership, and the first rule would fine
  them for weeks they were never in the league. The join-time rule is the intended one,
  and the one the group agreed. Membership here is demonstrably dynamic — the league
  went from 7 to 9 members within a day of being set up — so this is a live concern,
  not a hypothetical.
- **Dead teams** — no floor. A manager who stops setting a team loses repeatedly and
  is fined repeatedly. This is a social problem, not a software one.

## 3. Architecture

Next.js App Router on Vercel (Hobby). Chosen over a Vite SPA so that FPL data is
fetched and cached **server-side**: seven people opening the link after a deadline
produce one upstream fetch per revalidation window, not seven.

```
app/
  page.tsx                     current gameweek view (server component)
  balances/page.tsx            balances table (server component)
  api/admin/toggle/route.ts    PIN-gated paid/unpaid write
  api/monzo/webhook/route.ts   phase 4, additive
lib/
  fpl/client.ts                typed fetch, User-Agent header, zod validation
  fpl/schemas.ts               zod schemas for bootstrap / standings / history
  league/members.ts            resolve members from standings OR new_entries
  league/scoring.ts            pure: net scores, loser selection
  ledger/store.ts              Redis reads and writes
  ledger/reconcile.ts          which gameweeks still need recording
  config.ts                    LEAGUE_ID, FINE_PENCE, ADMIN_ENTRY
```

`scoring.ts` and `reconcile.ts` are pure functions over plain data with no I/O. They
hold every rule that could be argued about, and they are the only modules that
strictly need tests.

### Data flow, page load

1. Fetch `bootstrap-static/` (cached). Determine the current gameweek and which
   gameweeks are `finished && data_checked`.
2. Fetch league standings (cached). Resolve the seven members via `members.ts`.
3. Fetch `entry/{id}/history/` for each member (cached, 7 requests).
4. `reconcile.ts` compares settled gameweeks against recorded rows in Redis; any
   missing rows are computed by `scoring.ts` and written. This is the lazy
   alternative to a cron — Hobby crons run once daily with ±59 min precision and
   buy nothing over the first page view of the day.
5. Render.

### Caching

`fetch` with `next: { revalidate }`:

- 60 seconds while a gameweek is live
- 3600 seconds once the current gameweek is `data_checked`

The live view is explicitly labelled provisional until `data_checked`.

### Storage — Upstash Redis

Provisioned with `vercel install upstash`; credentials injected as env vars. Chosen
over Neon because the dataset is at most 7 × 38 booleans, Upstash is HTTP-based so it
needs no connection pooling, and it has no cold start on an idle project.

```
evicted:results   hash   field: gw   value: {"losers":[entryId],"scores":{entryId:net},"recordedAt":iso}
evicted:paid      set    member: "{gw}:{entryId}"
evicted:monzo     hash   fields: refresh_token, access_token, expires_at   (phase 4)
```

`evicted:results` is written once per gameweek and never rewritten — settled history
does not change. Paid state is a set membership test.

### Admin writes

`ADMIN_PIN` is an environment variable. The client prompts once and holds the PIN in
`localStorage`; `api/admin/toggle` compares with a timing-safe comparison and rejects
otherwise. The PIN is deliberately **not** a URL parameter — that leaks through
browser history, the `Referer` header on outbound links, and any screenshot shared in
the group chat.

The site itself is public. Vercel Hobby cannot password-protect a production domain:
Password Protection is Enterprise, or a paid Pro add-on, and Hobby's Vercel
Authentication covers preview deployments only, leaving production publicly
accessible. Everything displayed is already visible to all seven managers in the FPL
app, so only the write path is protected.

## 4. Views

**Current gameweek** — one card: the evictee's team name, manager, net score, gross
score, hits taken, and paid/unpaid state. Provisional marker while the gameweek is
live. Pre-season it shows the member list and the GW1 deadline instead.

**Balances** — a table of the seven managers with gameweeks lost, amount owed
(unpaid × £2), and amount paid. This is the view that supports paying in a lump sum
at the end.

Mantine for components, dark. Chosen over shadcn/ui, which is the default house style
of generated dashboards and is copy-in components rather than a library; Mantine is
already familiar from `fpl-tracker` and handles dark mode properly.

Squad-level detail — the loser's XI, captain, points left on the bench — is
explicitly **out of scope for v1**. It needs `bootstrap-static` player data and the
per-gameweek picks endpoint. Fetching picks for one settled loser is cheap and
permanently cacheable, so it is a clean v2 addition rather than something to design
around now.

## 5. Monzo reconciliation (phase 4, additive)

Ships after the app is fully usable with manual toggles. Nothing depends on it.

**Sequencing:** before any matcher is written, send £2 from another account and log
the real webhook payload. `counterparty` does not appear anywhere in Monzo's API
reference, and the docs openly state they are incomplete ("We'll eventually get
around to documenting them all"). The matcher is built from an observed payload, not
from an undocumented field.

**Matching rule:** inbound credits whose amount is a multiple of 200 pence settle
`amount / 200` unpaid gameweeks, oldest first, attributed by sender name. Any
remainder under £2 is held as credit and surfaced on the balances table — silently
discarding someone's money is the one bug guaranteed to cause an argument.

**Known ambiguity:** two Taylors (Joe, Finn) and two McGuinesses (Alex, Aidan) — now
out of nine rather than seven, but the clash is unchanged. A transfer arriving as
"MR TAYLOR" cannot be attributed. Ambiguous matches go to a pending queue the admin
approves with one tap rather than being guessed. Note that a growing league makes the
name-alias table a maintained thing, not a one-off: each new member needs an alias
entry before their payments can be matched.

**Filters**, all confirmed in the docs: top-ups arrive positive with `is_load: true`;
refunds and reversals arrive positive with `is_load: false`; declined transactions
carry `decline_reason`. A naive "any positive amount" filter catches all three.

**Token maintenance:** access tokens expire after 6 hours (`expires_in: 21600`).
Refreshing is single-use — it invalidates the old access token and issues a *new*
refresh token, which must be persisted on every refresh or authentication dies until
manually reauthorised. This is the one part of the system that is not
zero-maintenance, and the reason it ships last.

**Privacy:** the webhook fires for every transaction on a personal account.
Non-matching events are discarded immediately and never logged.

## 6. Error handling

- FPL returns non-200 or fails schema validation — serve the last good cached render
  and show a stale-data notice. Never write to Redis from unvalidated data.
- Redis unavailable — the gameweek view still renders from FPL data alone; payment
  state degrades to unknown rather than to "paid".
- A gameweek settles while nobody visits — the next visit reconciles it. Reconciliation
  runs oldest-first so a gap of several weeks resolves correctly.

## 7. Testing

Vitest, matching `fpl-tracker`'s setup.

- `scoring.ts` — net calculation, loser selection, ties, mid-season joiners, managers
  absent from a gameweek. Fixture-driven, no network.
- `reconcile.ts` — which gameweeks need writing given settled gameweeks and existing
  rows; multi-week gaps; already-recorded weeks are never rewritten.
- `members.ts` — resolves from `new_entries` pre-season and `standings` after, with
  both name shapes.
- Zod schemas — parse recorded fixtures captured from the live API.

The rules people will argue about live in pure functions, so they are tested without
mocking anything.

## 8. Phases

1. **Scaffold** — Next.js, Mantine, config, FPL client and schemas, member resolver.
   Renders the pre-season state with the real seven members.
2. **Scoring** — `scoring.ts` and its tests. Renders the current gameweek from live
   data once GW1 is scored.
3. **Ledger** — Upstash, `store.ts`, `reconcile.ts`, balances view, admin PIN toggle.
   The app is fully usable at the end of this phase.
4. **Monzo** — observe a real payload, then build the matcher and pending queue.
5. **v2, optional** — squad detail on the loser card.

## 9. Open items

- No git remote. `docs/agents/issue-tracker.md` assumes issues live in GitHub via the
  `gh` CLI, which needs a repo that does not yet exist.
- `fpl-fine-tracker/` remains on disk, locked by another process, and needs deleting
  manually. Its history was copied into this repo.
- The tie rule is being put to the group. `scoring.ts` isolates it so a change is a
  one-function edit.
