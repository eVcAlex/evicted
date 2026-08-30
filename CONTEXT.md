# Evicted - domain context

FPL mini-league money tracker. Two leagues share the same friend group: the
classic league `79294` (real money - £2 per gameweek finished bottom, plus a
£20 season buy-in, all into the pot) and a no-money draft league `77196`.

## Glossary

- **Fine** - £2 (`FINE_PENCE`) owed by whoever posts the lowest *net* score in
  a settled gameweek. Ties: everyone tied pays.
- **Buy-in** - the one-off £20 (`BUYIN_PENCE`) season entry. **Binary**: a
  member has paid it or not; there is no partial buy-in.
- **Pot** - every fine actually collected, plus every buy-in paid, plus every
  member's remaining **credit**.
- **Credit** - a per-member balance of money received beyond what they owed.
  Auto-applied to their future fines, shown as a negative on `/balances`,
  counted in the pot. Steady-state invariant: a member with positive credit
  has no unpaid fines. May go negative ("overdrawn") only after a payment
  reversal.
- **Payment waterfall** - how one incoming payment is split:
  oldest unpaid fines → buy-in → bank the remainder as credit
  (`planWaterfall`).
- **Credit-chase** - when a new fine is recorded against a member holding
  credit, `reconcileCredit` spends the credit to pay it, oldest first.
- **Settled gameweek** - one FPL reports as both `finished` and
  `data_checked`; only then is a result recorded and a fine owed.
- **Departed member** - someone no longer in the league standings who still
  owes fine debt. Never charged a buy-in retroactively; their credit is
  frozen (not shown, not potted).

## Stores (Upstash Redis)

- `evicted:results` - recorded gameweek results (authoritative)
- `evicted:paid` - set of `"gw:entry"` fine payments (authoritative)
- `evicted:buyin` - set of entry ids that have paid the buy-in (authoritative)
- `evicted:credit` - hash entry id → pence (authoritative)
- `evicted:payments` - append-only payment log (audit / reversal only)
- `evicted:monzo:*` - OAuth tokens, capture log, pending queue, sender aliases

## Key decisions

- `docs/adr/0001-credit-ledger.md` - why credit exists and why the payment
  log is not authoritative.
- **Admin auth** - `/admin` and the admin API routes are gated by Clerk
  (`middleware.ts`) and restricted to the emails in `ADMIN_ALLOWLIST` via
  `isAdmin` in `lib/admin.ts`. There is one admin. No PIN.
