# Evicted

Who finished bottom of the mini-league this week, and have they paid up.

Tracks the lowest **net** scorer each gameweek (gross points minus transfer hits)
in FPL classic league **79294 "Evicted"**, and records whether they've settled
their £2 fine.

Separate from `fpl-tracker`, which is a personal team viewer.

## League

- ID `79294`, invitational, `start_event: 1`. Membership is **dynamic**: 7 at first
  capture, 9 hours later on the same day, with one team renamed. Expect churn until the
  GW1 deadline (2026-08-21T17:30:00Z). Nothing hardcodes the roster.
- Admin entry `394534` (Alex McGuiness, "Høgh are you?")
- Pre-season, members appear in `new_entries.results`; they only move to
  `standings.results` once GW1 is scored, and the two arrays have different
  shapes (`player_first_name`/`player_last_name` vs `player_name`)

## Rules

- Loser = lowest net score (`points - event_transfers_cost`) for the gameweek
- Ties: everyone tied pays
- Fine: £2 per gameweek lost, one config constant
- Eligible from a manager's join gameweek; no floor for dead teams
- Provisional until the gameweek is `finished` **and** `data_checked` — only then
  is the row written. Bonus and auto-subs move the bottom spot.

## Stack

- Next.js App Router on Vercel (Hobby), ISR for FPL caching
- Upstash Redis via `vercel install upstash` for the paid/unpaid flags
- Mantine for components
- Public URL. Hobby cannot password-protect a production domain, and the data is
  already visible to all seven in the FPL app. The admin PIN protects only writes.

## Data

- `bootstrap-static/` — per-gameweek `finished` / `data_checked` flags
- `leagues-classic/79294/standings/` — members and gross gameweek totals
- `entry/{id}/history/` — the whole season per manager in one request
  (`points`, `event_transfers_cost` per GW). Replaces the per-gameweek picks
  loop: 7 requests, not 7 x 38.

Gameweek completion is detected lazily on page load — still true for
rendering, where it costs nothing to wait for the first visit. Push
notifications are the exception: see "PWA & notifications" below for why that
path also gets a scheduled trigger.

`event_total` in league standings is not relied upon — net is derived from
`history`, which is unambiguous.

## PWA & notifications

Installable, and pushes a notification for the week's loser as soon as a
gameweek settles — reusing the exact same quip logic as the live card
(`lib/push/send.ts` calls `quipFor` the same way `LoserCard.tsx` does).

- `lib/league/record.ts` returns `newlyRecorded` alongside the usual results
  map — the gameweek(s) written for the first time on *this* call, with full
  `LoserSummary` data (gross/hits/bench), not just the trimmed net-only
  `GameweekResult` the ledger persists.
- Settlement itself is still the lazy on-visit check above — cheap and
  correct for rendering. But a notification that might arrive hours late
  because nobody happened to open the app defeats the point of it, and Hobby
  cron's once-daily ±59 min precision doesn't help. So
  `.github/workflows/check-settled.yml` pings `/api/cron/check-settled`
  (guarded by `CRON_SECRET`) every ~10 min instead — free, no new account.
  Both paths funnel through the same `saveResult` `HSETNX`, so a real visitor
  and the scheduled check landing at once can't double-send.
- Subscriptions are anonymous per-device (`evicted:push` Redis hash), same
  trust model as the rest of the app — no accounts. A stale subscription
  (404/410 on send) is pruned automatically rather than retried forever.
- `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` / `CRON_SECRET`
  need setting in Vercel's Production env vars (see `.env.local` for the
  values already generated for this deployment); `CRON_SECRET` also needs to
  exist as a GitHub Actions repo secret of the same name.

## Monzo

The webhook (`app/api/monzo/webhook/route.ts`) both captures every raw
payload (admin-only audit log, `evicted:monzo:capture`) and runs the matcher
(`lib/monzo/matcher.ts`) against inbound credits.

- **Filter**: only a positive, non-top-up (`is_load: false`), non-declined
  (`decline_reason` absent) credit that is an exact multiple of `FINE_PENCE`
  is even considered. Everything else — card spending, top-ups, declines,
  odd amounts — is ignored before any name matching happens.
- **Dedupe**: Monzo redelivers on every state change a transaction goes
  through (six webhooks were observed for one real transaction while
  capturing the payload shape). `markTransactionSeen` (`evicted:monzo:seen`,
  a Redis `SADD`) makes sure only the first delivery of a given transaction
  id is ever processed.
- **Match**: by the sender's full name (`counterparty.name`), case-insensitive
  — Monzo sends inbound names in caps but outbound in title case.
  **Names clash**: two Taylors (Joe, Finn) and two McGuinesses (Alex, Aidan)
  out of 7, which is exactly why this matches on full name, not surname.
- **Auto-apply vs. queue**: a match only auto-applies (marks gameweeks paid)
  when the sender matches exactly one member *and* the credit exactly covers
  whole gameweeks they actually have unpaid — applied oldest-first. Anything
  that doesn't clear that bar (ambiguous name match, a matched member who
  owes less than they paid, or no name match at all) lands in a pending queue
  (`evicted:monzo:pending`, admin-viewable in `/admin` with a dismiss
  action) instead of being guessed at or silently dropped. A sender name not
  matching any member is *not* the same as "unrelated to the league" — a
  bank account's legal name and someone's FPL manager name can genuinely
  differ (confirmed live: "ALEXANDER MCGUINESS" vs the registered "Alex
  McGuiness" didn't match), so those get surfaced for a human to attribute
  rather than dropped on the assumption they're noise.
- Access tokens expire after 6h; refresh tokens are single-use and rotate, so the
  new one must be persisted on every refresh or auth dies until reauthorised.
- `counterparty` is undocumented in Monzo's API reference — the shape above
  was confirmed from a real captured payload, not guessed from the docs.
