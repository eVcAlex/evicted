# fpl-fine-tracker

Mobile-first dashboard for our FPL mini-league: finds the lowest **net** scorer each
gameweek (gross points minus transfer hits) and tracks whether they've paid the fine.

Separate from `fpl-tracker`, which is a personal team viewer.

## Status

Scaffolding. Design decisions so far:

- New repo, may reuse FPL fetching/schema code from `fpl-tracker`
- Current GW headline + season-long ledger of who owes what
- Payment ledger + admin toggle first; Monzo webhook reconciliation added after
- Admin PIN entered once and held in `localStorage`, verified server-side
  (not `?admin=PIN` in the URL — that leaks via history, Referer and screenshots)
- Fine amount is a single config constant; a tie for lowest net score means everyone tied pays

Open: hosting platform (Cloudflare end-to-end vs Vercel + Upstash), league ID.

## Notes on the Monzo integration

- Inbound transfer references arrive in `description`, not `notes`
- Access tokens expire after 6h; refresh tokens are single-use and rotate, so the
  new one must be persisted on every refresh
- The webhook fires for *every* transaction on the account — filter hard, log nothing else
