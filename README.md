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

## Monzo (later phase)

Flags and admin toggle ship first; the webhook is purely additive.

- Match inbound £2 (and multiples) credits, attribute by sender name, queue
  anything ambiguous for one-tap approval
- **Names clash**: two Taylors (Joe, Finn) and two McGuinesses (Alex, Aidan) out
  of 7. Surname alone cannot attribute a payment.
- `counterparty` is **undocumented** in Monzo's API reference. Before building
  the matcher, send £2 from another account and log the real payload.
- Filter carefully: top-ups are positive with `is_load: true`; refunds and
  reversals are positive with `is_load: false`; declined transactions carry
  `decline_reason`
- Access tokens expire after 6h; refresh tokens are single-use and rotate, so the
  new one must be persisted on every refresh or auth dies until reauthorised
- The webhook fires for *every* transaction on the account. Filter hard, log
  nothing else.
