# 1. A credit ledger for over- and mis-payments

**Date:** 2026-08-30
**Status:** Accepted

## Context

The Monzo matcher only settled whole unpaid fine gameweeks. A £20 season
buy-in from someone owing no fines, or any payment that didn't divide evenly
into what was owed, landed in the pending queue with no way to attribute it —
or was silently dropped before ever reaching the queue.

## Decision

Money a member sends beyond what they owe is banked as per-member **credit**
(`evicted:credit`, a Redis hash of pence). Credit auto-applies to their
future fines, shows as a negative balance, and counts toward the pot.

A `planWaterfall` pure function decides every split: oldest fines → buy-in
(binary, needs a full £20) → bank the rest. `applyPayment` runs it for both
the webhook and the pending-queue Approve action.

An append-only `evicted:payments` log records every applied payment and its
allocation. It is **not authoritative** — `evicted:paid` / `evicted:buyin` /
`evicted:credit` are. The log exists for the audit trail and for
`reversePayment`, which replays one payment's allocation backwards.

## Consequences

- Reversing a payment whose banked credit was already spent on a later fine
  drives the credit balance **negative** ("overdrawn"). We do **not** cascade
  — the admin fixes it by hand. Cascade logic isn't worth it for a
  six-person league.
- The £2-multiple rule stays as a guard, but an odd amount is now surfaced in
  the queue as `'unusual'` rather than dropped.
- Webhook auto-apply is capped at £100; larger clean matches queue as
  `'unusual'`. Approve is uncapped.
- Cross-key writes aren't transactional. A partial failure is logged loudly
  and left visible, never silently retried or hidden.
- A reversal's log id is **deterministic** — `reversal:<originalId>`, not a
  uuid. That is what makes the "already reversed" guard a cheap lookup in the
  payment log; replacing it with a random id would silently remove
  double-reverse protection.
- `applyPayment`'s writes are non-transactional and its audit entry
  (`appendPayment`) is written **last**, which is what lets the replay guard
  tell a completed payment from a partially-applied one. The accepted residual:
  a run that writes `evicted:paid` / `evicted:buyin` / `evicted:credit`
  successfully and then fails on `appendPayment` leaves a `console.error`, no
  audit entry, and a balance the admin can see — recoverable by hand, or by
  Reverse once the payment is re-applied. Retrying is safe for fines (a paid
  fine can't be re-paid, since `planWaterfall` re-derives the allocation from
  live state), so the exposure is limited to a re-banked credit remainder.
