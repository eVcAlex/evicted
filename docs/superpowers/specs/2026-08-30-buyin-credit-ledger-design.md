# Buy-in matching & the credit ledger — design

**Date:** 2026-08-30
**Status:** Approved, not yet implemented

Today a payment from a league member only lands cleanly if it covers whole
unpaid **fine** gameweeks. A £20 season buy-in from someone who owes no fines
(Struan, right now) falls into the pending queue as `no-debt` — a reason with
*no* action button, only "Remove". The admin's only recourse is to toggle the
buy-in by hand on `/balances` and then dismiss the pending card.

This design makes the payment matcher understand the buy-in, and adds a
**credit** concept so that any money a member sends beyond what they owe is
banked rather than lost, and auto-applied to their future fines.

## 1. Verified facts

Checked against the live APIs on 2026-08-30.

| Fact | Value |
|---|---|
| Classic league | `79294` "Evicted", `start_event: 1` |
| Buy-in | `BUYIN_PENCE = 2000` — one-off, per member, currently a bare `Set<number>` in `evicted:buyin` |
| Fine | `FINE_PENCE = 200` per gameweek finished bottom |
| Existing ledger keys | `evicted:results` (hash), `evicted:paid` (set of `"gw:entry"`), `evicted:buyin` (set of `entry`) |
| Monzo matcher gate | `extractEligibleCredit` rejects anything not a positive, non-`is_load`, non-declined, **exact £2-multiple** credit |
| Pending reasons today | `ambiguous`, `no-debt`, `no-match` — `no-debt` has `canApprove: false` |
| Live pending queue | Holds real `no-debt` entries now, including Struan's £20 (`from STRUAN HALL`) |
| Single admin | `ADMIN_ENTRY = 394534`; every admin write is PIN-gated and already assumed serial (`dismissPending` rewrites the whole list) |

### Consequences

- **The £2-multiple rule stays.** It is the guard that stops a mate paying you
  back for lunch from being read as league money. Every real case here — £2
  fines, the £20 buy-in, credit banked in £2 units — already satisfies it. An
  odd amount is now *surfaced* (see §5) rather than silently dropped, but it is
  never auto-applied.
- **The existing `evicted:paid` / `evicted:buyin` sets remain authoritative**
  for "what has been paid". The new payment log (§3) is an append-only audit and
  reversal trail layered alongside them. No historical migration.
- **Cross-key writes are not transactional.** A payment touches up to three
  Redis keys (`evicted:paid`, `evicted:buyin`, `evicted:credit`) plus the log.
  Accepted, as `dismissPending` already accepts it: single admin, low rate. A
  partial failure is logged loudly (`console.error`), not swallowed.

## 2. The model

**Credit** is a per-member balance, in pence, of money received beyond what the
member owed at the time it arrived. It is:

- **auto-applied** to fines — as a payment lands, and again whenever a new fine
  is recorded against a member who holds credit (§4);
- **shown as a negative** on `/balances` — a member in credit has negative
  `owedPence`, rendered as a distinct "credit" state, not "clear";
- **counted in the pot** — the money is physically in the account, so
  `potPence = fines paid + buy-ins paid + credit remaining`.

Steady-state invariant: **`credit > 0` ⟹ the member has no unpaid fines.** A
member cannot simultaneously owe a fine and sit on credit — the credit would
have been consumed. §4's reconcile step exists to restore this invariant if a
store outage ever breaks it.

The buy-in stays **binary** — a member id is either in `evicted:buyin` or not.
Credit covers it only in whole: the buy-in flips to paid only when £20 is
available in one step (§3). A smaller remainder banks as credit and covers the
buy-in on a later payment once it reaches £20.

## 3. Storage

Two new keys.

### `evicted:credit` — the authoritative credit balance

Redis hash, `entryId → pence`. Mutated by `applyPayment` (§5), `reconcileCredit`
(§5) and `reversePayment` (§8). A missing field means zero. May legitimately go
**negative** after a reversal (§8, Q15a).

```
getCredit(): Promise<Map<number, number>>
setCredit(entryId: number, pence: number): Promise<void>   // absolute, not delta
```

### `evicted:payments` — the append-only payment log

Redis list, bounded to ~200 (same `lpush` + `ltrim` pattern as
`evicted:monzo:capture`). One entry per applied payment:

```ts
interface PaymentLogEntry {
  /** Monzo txId for webhook payments; a synthetic id otherwise —
   *  `chase:<uuid>`, `reversal:<originalId>`, `reversed:<originalId>`. */
  id: string;
  entryId: number;
  amountPence: number;
  source: 'monzo' | 'credit-chase' | 'reversal';
  receivedAt: string; // ISO
  allocation: {
    fineGameweeks: number[];   // gameweeks this entry marked paid (or, for
                               // reversal/chase, un-paid / covered)
    buyin: boolean;            // whether this entry flipped the buy-in
    creditDeltaPence: number;  // signed change to the credit balance
  };
}
```

`credit-chase` entries carry no real transaction — `id` is `chase:<uuid>`,
`amountPence` is 0, `allocation.creditDeltaPence` is negative and
`allocation.fineGameweeks` holds the fine(s) the credit just covered.

`reversal` entries record the inverse of a reversed payment's allocation (§8),
for the audit trail only — nothing reads them back to compute state.

```
appendPayment(entry: PaymentLogEntry): Promise<void>
getPayments(): Promise<PaymentLogEntry[]>   // newest first
```

## 4. The waterfall

`lib/ledger/waterfall.ts` — one pure function, the TDD target. No I/O.

```ts
planWaterfall(params: {
  amountPence: number;
  unpaidFines: number[];     // this member's unpaid fine gameweeks, oldest first
  buyinPaid: boolean;
  creditPence: number;       // this member's current credit balance
}): {
  fineGameweeks: number[];
  buyin: boolean;
  creditDeltaPence: number;  // signed: final change to the credit balance
}
```

Only the **positive** part of existing credit is spendable — a negative balance
(post-reversal overdraft) is left for the admin, not repaired silently by the
next payment.

```
pool            = amountPence + max(creditPence, 0)

finesToPay      = unpaidFines.slice(0, floor(pool / 200))      // oldest first
pool           -= finesToPay.length * 200

buyin           = !buyinPaid && pool >= 2000
pool           -= buyin ? 2000 : 0

bankedRemainder = pool                                          // ≥ 0
newCreditBalance = min(creditPence, 0) + bankedRemainder
creditDeltaPence = newCreditBalance - creditPence
```

- `min(creditPence, 0)` — the positive part was moved into `pool` and spent
  from there, so only a negative carry survives into the new balance.
- A payment that banks money → `creditDeltaPence > 0`. One that consumes
  pre-existing credit to clear fines → `creditDeltaPence < 0`.
- Nothing ever pays *more* fines than `unpaidFines` holds, or flips a buy-in
  that is already paid.

Worked cases:

| `creditPence` | `unpaidFines` | `buyinPaid` | `amountPence` | `fineGameweeks` | `buyin` | `creditDeltaPence` | note |
|---|---|---|---|---|---|---|---|
| 0 | `[]` | true | 600 | `[]` | false | +600 | plain credit |
| 0 | `[3,4,5]` | false | 2000 | `[3,4,5]` | false | +1400 | £6 fines, £14 banked toward buy-in |
| 0 | `[3,4]` | false | 2000 | `[3,4]` | false | +1600 | buy-in not flipped: <£20 left |
| 1500 | `[]` | false | 500 | `[]` | true | −1500 | £15 credit + £5 → buy-in |
| 600 | `[3,4,5,6]` | true | 200 | `[3,4,5,6]` | false | −600 | post-outage: £6 credit + £2 clears 4 fines |
| −800 | `[]` | true | 1000 | `[]` | false | +1000 | overdraft −£8, £10 in → −£8 + £10 = +£2 net |

## 5. Applying a payment

`lib/monzo/apply.ts`: `applyIfOwed` is replaced by **`applyPayment`** — the
single entry point, called by both the webhook (§6) and the pending-queue
Approve action (§7). `planApplication` is deleted from `matcher.ts` (absorbed).

```
applyPayment(params: {
  entryId: number;
  amountPence: number;
  txId: string;              // real txId, or a synthetic id for admin actions
  receivedAt: string;
  members: Member[];
}): Promise<{ fineGameweeks: number[]; buyin: boolean; creditDeltaPence: number }>
```

It:

1. builds the member's balance (`buildBalances`, now credit-aware) to get
   `unpaidFines`, `buyinPaid`, `creditPence`;
2. calls `planWaterfall`;
3. writes the result — `setPaid` per fine gameweek, `setBuyin` if flipped,
   `setCredit(entryId, creditPence + creditDeltaPence)`;
4. `appendPayment` with the allocation.

Steps 3–4 are not atomic; a throw between them is logged and surfaced (the
pending card is not dismissed, the log entry may be missing — the admin sees the
inconsistency rather than a silent wrong number).

### Credit-chase — `reconcileCredit`

`lib/ledger/credit.ts` — alongside `getCredit` / `setCredit`, in the ledger
layer, deliberately *not* in `lib/league/record.ts`.

```
reconcileCredit(members: Member[]): Promise<void>
```

For every member holding positive credit who also has unpaid fines, consume
credit oldest-fine-first (£2 each), `setPaid` those gameweeks, `setCredit` the
reduced balance, and `appendPayment` a `credit-chase` entry per member covering
all the gameweeks it cleared. Never touches the buy-in.

Called alongside `recordSettledGameweeks` by the two places that record
gameweeks: the home-page render path (`checkAndNotifySettled`) and the cron
(`lib/cron.ts`). After it runs, the §2 invariant holds again.

## 6. The webhook path

`app/api/monzo/webhook/route.ts` and `lib/monzo/matcher.ts`.

- **`extractEligibleCredit`** still rejects negatives, `is_load`, and declines.
  It now **returns** non-£2-multiple credits instead of dropping them — the
  webhook routes them to the `unusual` pending reason.
- **Match precedence:** `no-match` > `ambiguous` > `unusual`. Name resolution
  runs first; the amount sanity check only flags an otherwise-clean single
  match.
- **`unusual`** = amount > £100 **or** amount not a £2-multiple. A clean single
  name match for a £2-multiple ≤ £100 auto-runs `applyPayment`. Anything else is
  queued.
- The £100 cap gates **unattended auto-apply only**. Approve (§7) is uncapped —
  the admin is looking straight at the amount.

### `PendingReason` after this change

`ambiguous | no-match | unusual | reversed`

`no-debt` is **removed** — under the waterfall a matched member with no fines
just banks credit, so it can never fire. `REASONS` (`app/components/admin/reasons.ts`)
gains a **generic fallback** for any unknown reason string, so the `no-debt`
entries already sitting in the live queue (including Struan's) still render
after deploy and can be resolved by hand.

`reversed` (§8): detail "Payment reversed — re-attribute or remove", the single
candidate is the original member. The re-queued pending entry's `id` is
`reversed:<originalId>`.

## 7. The pending queue

`app/components/admin/PendingQueue.tsx`.

- The `canApprove` gate is **removed**. Every pending card gets the member
  dropdown + Approve.
  - `no-match`, `unusual`, `reversed`: dropdown is the full roster
    (`/api/monzo/members`).
  - `ambiguous`: dropdown is the candidates only (unchanged).
- **Approve** → `POST /api/monzo/pending` → `applyPayment` with the chosen
  member, the pending entry's `amountPence`, the pending `id` as `txId`, and the
  pending `receivedAt`. Uncapped. Still calls `saveAlias(normalizeName(name),
  entryId)` so future payments from that sender auto-apply.
- **Remove** is unchanged — one-off dismiss, remembers nothing.

### How Struan's £20 resolves

Post-deploy the admin opens the queue, picks "Egg Fried Reus" on his card, hits
Approve. `applyPayment` → `planWaterfall({ amountPence: 2000, unpaidFines: [],
buyinPaid: false, creditPence: 0 })` → `{ fineGameweeks: [], buyin: true,
creditDeltaPence: 0 }`. Buy-in flips, no credit banked, card dismissed.

## 8. Reversal

New route **`POST /api/admin/reverse-payment`** `{ paymentId }`, PIN-gated.

`reversePayment(paymentId)`:

1. Look up the `PaymentLogEntry`. Reject if `source !== 'monzo'` — only a real
   webhook payment is reversible through this path (§9 only shows Reverse on
   those rows; this guard is defence in depth).
2. Undo its allocation: `setPaid(gw, entryId, false)` for each
   `allocation.fineGameweeks`; `setBuyin(entryId, false)` if `allocation.buyin`;
   `setCredit(entryId, currentBalance − allocation.creditDeltaPence)`.
3. The credit balance **may go negative** — shown red on `/balances` as
   "overdrawn". There is **no cascade**: a later `credit-chase` that spent this
   payment's banked credit is left alone; the admin reconciles by hand. (Q15a —
   deliberate, cascade logic is not worth it for a six-person league.)
4. The original Monzo `txId` **stays in the SEEN set** — redelivery will not
   silently re-apply it.
5. Append a `reversal:<originalId>` log entry (negative of the original
   allocation, for the audit trail). The id is **deterministic, not a uuid**:
   the "already reversed" guard is a lookup for `reversal:<originalId>` in this
   log, so a random id would silently remove double-reverse protection.
6. Re-queue a pending entry: `reason: 'reversed'`, candidate = original member,
   so the admin can immediately re-attribute or Remove.

A `credit-chase` entry has no independent Reverse — it is a consequence of its
parent payment, and per step 3 reversing the parent simply drives credit
negative.

## 9. The admin page

`app/admin/page.tsx` + a new `RecentPayments` component, below the pending
queue.

- **`GET /api/admin/payments`** — PIN-gated, returns `getPayments()` (newest
  first, ~20 shown).
- Columns: date · member (resolved from `entryId` against current standings; a
  departed member shows `Entry {id}`) · amount · allocation summary (e.g.
  "GW3, GW4 + £6 credit", or "Buy-in", or "−£4 credit → GW5") · Reverse button.
- `credit-chase` and `reversal` rows are shown **greyed with no Reverse
  button**.

## 10. Balances & pot

- **`buildBalances`** (`lib/league/balances.ts`) gains a `credit: Map<number,
  number>` param. It is the **single place** credit reduces `owedPence`:
  `owedPence = unpaidFines·200 + (buyinOwed ? 2000 : 0) − credit`. This can be
  negative. `paidPence` is unchanged (fines + buy-in actually paid).
- **Departed members**: credit is **frozen** — not subtracted, not shown, not
  potted. Same restriction `buildBalances` already applies (departed members
  carry fine debt only).
- **`BalancesTable`** gains a third state: `owes | clear | credit`. A `credit`
  row shows the magnitude with unit "credit", styled distinct from "clear".
- **`YourBalance`**: a `credit` branch — "You're £4 in credit."
- **Group "outstanding" total** on `/balances`: `sum(max(owedPence, 0))` — credit
  members do not reduce what others owe.
- **`buildPot`** (`lib/league/pot.ts`): `potPence = Σ paidPence + Σ max(credit,
  0)`. `Pot` gains a `creditPence` field for display. Credit spent on a fine is
  not double-counted: the `credit-chase` drops `creditDeltaPence` by £2 and
  raises `paidPence` by £2, net zero.
- **`safeGetCredit`** joins `safeGetPaid` / `safeGetResults` / `safeGetBuyins`
  in `lib/ledger/safe.ts` — an unreachable store degrades credit to empty +
  `degraded: true`, and `buildPot` is suppressed when any input is degraded (as
  it already is).

## 11. Testing

- **`planWaterfall`** — the core. Cases: exact fine cover; partial fine cover;
  fines + buy-in + remainder; £20 buy-in only, no fines; buy-in skipped when
  pool < £20; pre-existing credit reconciled against fines; credit + payment
  together clearing fines; nothing owed → all banked; overpay when everything
  already paid.
- **`reconcileCredit`** — credit + unpaid fine → fine paid, credit reduced, log
  entry written; credit but no unpaid fines → no-op; multiple fines cleared in
  one chase entry; never touches buy-in.
- **`reversePayment`** — undoes fines; undoes buy-in; subtracts a positive
  delta; drives credit negative and does not cascade; re-queues `reversed`;
  leaves txId SEEN.
- **`buildBalances`** — credit reduces `owedPence`; goes negative; departed
  member's credit ignored.
- **`buildPot`** — credit remaining added; credit-then-chase nets zero.
- **matcher / webhook** — `unusual` on >£100; `unusual` on odd amount;
  precedence `no-match` > `ambiguous` > `unusual`; ≤£100 clean match still
  auto-applies.
- **`REASONS` fallback** — unknown reason string renders without throwing.

## 12. Rollout

1. Ships as one PR on `feat/buyin-credit-ledger`, **after** the draft-live fix
   (§14) has merged to `main`.
2. No data migration. On deploy: `evicted:credit` and `evicted:payments` do not
   exist yet — every read treats them as empty, which is correct.
3. The live pending queue's `no-debt` entries render via the `REASONS` fallback.
   The admin Approves Struan's card (§7) and Removes or re-attributes the
   others.
4. Pre-existing paid marks have no payment-log entry and are **not reversible**
   through the new UI — unchanged from today, where they were not reversible at
   all.
5. The PR also carries `docs/adr/0001-credit-ledger.md` (why credit exists, why
   the log is non-authoritative, Q15a's no-cascade choice) and a new root
   `CONTEXT.md` seeding the glossary with **credit**, **payment waterfall**,
   **credit-chase** and **buy-in** (binary).

## 13. Out of scope

- Cascade reversal (§8 step 3).
- Partial / fractional buy-in tracking — buy-in stays binary.
- Refunding credit out of the system (a member leaving with credit) — §10
  freezes it; paying it back is a real-world cash problem, not the app's.
- Loosening name matching — non-matches still go to the queue exactly as now.
- Per-member credit history view for non-admins.

## 14. Related, separate — draft-live detection

Tracked here for context; **not part of this PR**, no spec doc of its own.

`/draft` is stuck on the "Nobody yet" screen because it gates on
`details.league.draft_status`, and the live FPL Draft API leaves that at `"pre"`
even though the draft ran on 2026-08-21 (`league.drafts[0].draft_completed` is
set, `current_event: 2`, GW1 matches `finished: true`).

Fix, as its own PR off `main`, merging first:

- `draftLeagueMetaSchema` gains `drafts: z.array(z.object({ draft_completed:
  z.string().nullable() }))`.
- New pure `isDraftLive(league)` in `lib/draft/` → `league.drafts.some((d) =>
  d.draft_completed !== null)`, with its own test.
- `app/draft/page.tsx` gates on `!isDraftLive(details.league)` instead of
  `draft_status === 'pre'`.
- The standings table and the unparsed `matches[]` are untouched — FPL's
  `standings` array already holds at the last settled gameweek (GW1), so "show
  GW1, GW2 pending" falls out for free.
