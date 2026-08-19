# Evicted

Who finished bottom of the mini-league this week, and have they paid up.

Tracks the lowest **net** scorer each gameweek (gross points minus transfer hits)
in FPL classic league **79294 "Evicted"**, and records whether they've settled
their £2 fine.

Separate from `fpl-tracker`, which is a personal team viewer.

## League

- ID `79294`, invitational, `start_event: 1`, 7 managers — verified against the API
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

Gameweek completion is detected lazily on page load. Hobby crons run once daily
with ±59 min precision, which buys nothing over the first page view of the day.

`event_total` in league standings is not relied upon — net is derived from
`history`, which is unambiguous.

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
