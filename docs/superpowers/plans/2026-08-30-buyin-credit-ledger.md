# Buy-in & Credit Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the Monzo payment matcher to settle the £20 buy-in, and bank any money a member sends beyond what they owe as per-member *credit* that auto-applies to their future fines.

**Architecture:** A pure `planWaterfall` function decides how one payment is split (oldest fines → buy-in → bank the rest). `applyPayment` runs it and writes the result to Redis: the existing `evicted:paid` / `evicted:buyin` sets plus a new `evicted:credit` hash, with an append-only `evicted:payments` log for audit and reversal. `reconcileCredit` chases newly-recorded fines with any banked credit. The webhook auto-applies clean matches ≤ £100; everything else lands in the pending queue, where every card can now be attributed with Approve.

**Tech Stack:** Next.js 16 App Router, TypeScript, Zod, Upstash Redis (`@upstash/redis`), Vitest (runs `lib/**/*.test.ts` only — route and component code is verified by `tsc --noEmit` + `next build`), Mantine.

**Spec:** `docs/superpowers/specs/2026-08-30-buyin-credit-ledger-design.md` — read it alongside this plan.

## Global Constraints

- `FINE_PENCE = 200`, `BUYIN_PENCE = 2000` — import from `@/lib/config`, never inline the numbers.
- The £2-multiple rule stays as a matcher concept; only its *effect* changes (odd amounts now queue, not drop).
- Webhook auto-apply cap: **£100** (`WEBHOOK_AUTO_APPLY_CAP_PENCE = 10000`), added to `@/lib/config`. Gates unattended auto-apply only; Approve is uncapped.
- Existing `evicted:paid` / `evicted:buyin` remain authoritative for "what is paid". The payment log is audit/reversal only — nothing reads it back to compute balances.
- Cross-key Redis writes are **not** transactional. On a partial-write failure: `console.error` loudly, never swallow silently, never throw out of a page render.
- `PendingReason` after this work: `'ambiguous' | 'no-match' | 'unusual' | 'reversed'`. `'no-debt'` is removed.
- Waterfall invariant: `credit > 0` ⟹ the member has no unpaid fines.
- Tests: real code, no mocking the pure functions. Mock only Redis (`@upstash/redis`) and the `safe*` / `store` boundary, following the patterns already in `lib/ledger/store.test.ts` and `lib/monzo/apply.test.ts`.
- Commit after every task with a Conventional Commits message.
- Branch: `feat/buyin-credit-ledger` (already exists, holds the spec commit). Rebase onto `main` once `fix/draft-live-detection` has merged.

---

### Task 1: Ledger store — credit & payment-log primitives

**Files:**
- Modify: `lib/ledger/store.ts` (add keys, `getCredit`/`setCredit`, `PaymentLogEntry`, `appendPayment`/`getPayments`)
- Test: `lib/ledger/store.test.ts` (extend the `@upstash/redis` mock, add describe blocks)

**Interfaces:**
- Consumes: `redisClient()` from `@/lib/redis`.
- Produces:
  - `getCredit(): Promise<Map<number, number>>` — entryId → pence, missing = absent
  - `setCredit(entryId: number, pence: number): Promise<void>` — absolute set
  - `interface PaymentLogEntry { id: string; entryId: number; amountPence: number; source: 'monzo' | 'credit-chase' | 'reversal'; receivedAt: string; allocation: { fineGameweeks: number[]; buyin: boolean; creditDeltaPence: number } }`
  - `appendPayment(entry: PaymentLogEntry): Promise<void>`
  - `getPayments(): Promise<PaymentLogEntry[]>` — newest first, ≤ 200

- [ ] **Step 1: Extend the Redis mock and write failing tests**

In `lib/ledger/store.test.ts`, add to the mock's method list and the destructured import:

```typescript
const hset = vi.fn();
const lpush = vi.fn();
const ltrim = vi.fn();
const lrange = vi.fn();

vi.mock('@upstash/redis', () => ({
  Redis: class {
    hgetall = hgetall;
    hsetnx = hsetnx;
    hset = hset;
    smembers = smembers;
    sadd = sadd;
    srem = srem;
    lpush = lpush;
    ltrim = ltrim;
    lrange = lrange;
  },
}));

const {
  getBuyins, getPaid, getResults, paidKey, saveResult, setBuyin, setPaid,
  getCredit, setCredit, appendPayment, getPayments,
} = await import('./store');
```

Add these describe blocks:

```typescript
describe('getCredit', () => {
  it('returns an empty map when no credit is recorded', async () => {
    hgetall.mockResolvedValue(null);
    expect(await getCredit()).toEqual(new Map());
  });

  it('keys credit by entry id as a number', async () => {
    hgetall.mockResolvedValue({ '1': 600, '2': -800 });
    const credit = await getCredit();
    expect(credit.get(1)).toBe(600);
    expect(credit.get(2)).toBe(-800);
  });
});

describe('setCredit', () => {
  it('writes the absolute pence balance under the entry id', async () => {
    await setCredit(394534, 1400);
    expect(hset).toHaveBeenCalledWith('evicted:credit', { '394534': 1400 });
  });
});

describe('appendPayment', () => {
  it('pushes the entry and trims the list to its cap', async () => {
    const entry = {
      id: 'tx_1', entryId: 1, amountPence: 2000, source: 'monzo' as const,
      receivedAt: '2026-08-30T00:00:00Z',
      allocation: { fineGameweeks: [3], buyin: true, creditDeltaPence: 0 },
    };
    await appendPayment(entry);
    expect(lpush).toHaveBeenCalledWith('evicted:payments', entry);
    expect(ltrim).toHaveBeenCalledWith('evicted:payments', 0, 199);
  });
});

describe('getPayments', () => {
  it('reads the list newest first', async () => {
    const entries = [{ id: 'tx_2' }, { id: 'tx_1' }];
    lrange.mockResolvedValue(entries);
    expect(await getPayments()).toBe(entries);
    expect(lrange).toHaveBeenCalledWith('evicted:payments', 0, 199);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run lib/ledger/store.test.ts`
Expected: FAIL — `getCredit`/`setCredit`/`appendPayment`/`getPayments` are not exported.

- [ ] **Step 3: Implement in `lib/ledger/store.ts`**

Add near the other key constants and functions:

```typescript
const CREDIT_KEY = 'evicted:credit';
const PAYMENTS_KEY = 'evicted:payments';

/** Bounded like the Monzo capture log — this only grows on real payments. */
const MAX_PAYMENTS = 200;

export async function getCredit(): Promise<Map<number, number>> {
  const raw = await redisClient().hgetall<Record<string, number>>(CREDIT_KEY);
  if (!raw) return new Map();
  return new Map(Object.entries(raw).map(([id, pence]) => [Number(id), Number(pence)]));
}

/** Absolute set, not a delta — callers compute the new balance. */
export async function setCredit(entryId: number, pence: number): Promise<void> {
  await redisClient().hset(CREDIT_KEY, { [entryId]: pence });
}

export interface PaymentLogEntry {
  /** Monzo txId for webhook payments; `chase:<uuid>`, `reversal:<originalId>`
   *  or `reversed:<originalId>` for entries the app creates itself. */
  id: string;
  entryId: number;
  amountPence: number;
  source: 'monzo' | 'credit-chase' | 'reversal';
  receivedAt: string;
  allocation: {
    fineGameweeks: number[];
    buyin: boolean;
    creditDeltaPence: number;
  };
}

/**
 * Append-only audit + reversal trail. Not authoritative — `evicted:paid` /
 * `evicted:buyin` / `evicted:credit` are. Pushed as an object, not a JSON
 * string: the Upstash client serialises values itself (same as the Monzo
 * capture log).
 */
export async function appendPayment(entry: PaymentLogEntry): Promise<void> {
  const r = redisClient();
  await r.lpush(PAYMENTS_KEY, entry);
  await r.ltrim(PAYMENTS_KEY, 0, MAX_PAYMENTS - 1);
}

export async function getPayments(): Promise<PaymentLogEntry[]> {
  return redisClient().lrange<PaymentLogEntry>(PAYMENTS_KEY, 0, MAX_PAYMENTS - 1);
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run lib/ledger/store.test.ts`
Expected: PASS, all pre-existing store tests still green.

- [ ] **Step 5: Commit**

```bash
git add lib/ledger/store.ts lib/ledger/store.test.ts
git commit -m "feat: add credit balance and payment-log store primitives"
```

---

### Task 2: `planWaterfall` — the pure allocation function

**Files:**
- Create: `lib/ledger/waterfall.ts`
- Test: `lib/ledger/waterfall.test.ts`

**Interfaces:**
- Consumes: `FINE_PENCE`, `BUYIN_PENCE` from `@/lib/config`.
- Produces:
  - `interface PaymentAllocation { fineGameweeks: number[]; buyin: boolean; creditDeltaPence: number }`
  - `planWaterfall(params: { amountPence: number; unpaidFines: number[]; buyinPaid: boolean; creditPence: number }): PaymentAllocation`
  - `unpaidFines` must be passed oldest-first; the function slices it in order.

- [ ] **Step 1: Write the failing test**

`lib/ledger/waterfall.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { planWaterfall } from './waterfall';

describe('planWaterfall', () => {
  it('banks a payment when nothing is owed', () => {
    expect(planWaterfall({ amountPence: 600, unpaidFines: [], buyinPaid: true, creditPence: 0 }))
      .toEqual({ fineGameweeks: [], buyin: false, creditDeltaPence: 600 });
  });

  it('pays the oldest unpaid fines first, £2 each', () => {
    expect(planWaterfall({ amountPence: 200, unpaidFines: [3, 5], buyinPaid: true, creditPence: 0 }))
      .toEqual({ fineGameweeks: [3], buyin: false, creditDeltaPence: 0 });
  });

  it('never pays more fines than are unpaid, banking the rest', () => {
    expect(planWaterfall({ amountPence: 2000, unpaidFines: [3], buyinPaid: true, creditPence: 0 }))
      .toEqual({ fineGameweeks: [3], buyin: false, creditDeltaPence: 1800 });
  });

  it('flips the buy-in when £20 is available after fines', () => {
    expect(planWaterfall({ amountPence: 2000, unpaidFines: [], buyinPaid: false, creditPence: 0 }))
      .toEqual({ fineGameweeks: [], buyin: true, creditDeltaPence: 0 });
  });

  it('leaves the buy-in unflipped when less than £20 remains, banking it', () => {
    expect(planWaterfall({ amountPence: 2000, unpaidFines: [3, 4], buyinPaid: false, creditPence: 0 }))
      .toEqual({ fineGameweeks: [3, 4], buyin: false, creditDeltaPence: 1600 });
  });

  it('does not re-flip a buy-in that is already paid', () => {
    expect(planWaterfall({ amountPence: 2000, unpaidFines: [], buyinPaid: true, creditPence: 0 }))
      .toEqual({ fineGameweeks: [], buyin: false, creditDeltaPence: 2000 });
  });

  it('spends existing credit plus the payment to buy in', () => {
    expect(planWaterfall({ amountPence: 500, unpaidFines: [], buyinPaid: false, creditPence: 1500 }))
      .toEqual({ fineGameweeks: [], buyin: true, creditDeltaPence: -1500 });
  });

  it('reconciles pre-existing credit against unpaid fines (post-outage)', () => {
    expect(planWaterfall({ amountPence: 200, unpaidFines: [3, 4, 5, 6], buyinPaid: true, creditPence: 600 }))
      .toEqual({ fineGameweeks: [3, 4, 5, 6], buyin: false, creditDeltaPence: -600 });
  });

  it('only spends the positive part of credit; an overdraft survives', () => {
    expect(planWaterfall({ amountPence: 1000, unpaidFines: [], buyinPaid: true, creditPence: -800 }))
      .toEqual({ fineGameweeks: [], buyin: false, creditDeltaPence: 1000 });
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run lib/ledger/waterfall.test.ts`
Expected: FAIL — `./waterfall` cannot be resolved.

- [ ] **Step 3: Write minimal implementation**

`lib/ledger/waterfall.ts`:

```typescript
import { BUYIN_PENCE, FINE_PENCE } from '@/lib/config';

export interface PaymentAllocation {
  /** Unpaid fine gameweeks this payment covers, oldest first. */
  fineGameweeks: number[];
  /** Whether this payment flips the (binary) season buy-in to paid. */
  buyin: boolean;
  /** Signed change to the member's credit balance: + banked, − spent. */
  creditDeltaPence: number;
}

/**
 * Splits one incoming payment. See
 * `docs/superpowers/specs/2026-08-30-buyin-credit-ledger-design.md` §4.
 *
 * Only the positive part of an existing credit balance is spendable — a
 * negative balance (a post-reversal overdraft) is left for the admin, not
 * quietly repaired by the next payment.
 */
export function planWaterfall(params: {
  amountPence: number;
  unpaidFines: number[];
  buyinPaid: boolean;
  creditPence: number;
}): PaymentAllocation {
  const { amountPence, unpaidFines, buyinPaid, creditPence } = params;

  let pool = amountPence + Math.max(creditPence, 0);

  const affordableFines = Math.floor(pool / FINE_PENCE);
  const fineGameweeks = unpaidFines.slice(0, affordableFines);
  pool -= fineGameweeks.length * FINE_PENCE;

  const buyin = !buyinPaid && pool >= BUYIN_PENCE;
  if (buyin) pool -= BUYIN_PENCE;

  const newCreditBalance = Math.min(creditPence, 0) + pool;
  return { fineGameweeks, buyin, creditDeltaPence: newCreditBalance - creditPence };
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run lib/ledger/waterfall.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add lib/ledger/waterfall.ts lib/ledger/waterfall.test.ts
git commit -m "feat: add planWaterfall payment allocation"
```

---

### Task 3: `safeGetCredit` / `safeGetPayments`

**Files:**
- Modify: `lib/ledger/safe.ts`
- Test: `lib/ledger/safe.test.ts`

**Interfaces:**
- Consumes: `getCredit`, `getPayments`, `PaymentLogEntry` from `./store` (Task 1).
- Produces:
  - `safeGetCredit(): Promise<{ credit: Map<number, number>; degraded: boolean }>`
  - `safeGetPayments(): Promise<{ payments: PaymentLogEntry[]; degraded: boolean }>`

- [ ] **Step 1: Write the failing tests**

In `lib/ledger/safe.test.ts`, extend the mock and add tests:

```typescript
const getCredit = vi.fn();
const getPayments = vi.fn();

vi.mock('./store', () => ({ getBuyins, getPaid, getResults, getCredit, getPayments }));

const { safeGetBuyins, safeGetPaid, safeGetResults, safeRecordSettledGameweeks, safeGetCredit, safeGetPayments } =
  await import('./safe');
```

```typescript
describe('safeGetCredit', () => {
  it('passes the map through when Redis answers', async () => {
    getCredit.mockResolvedValue(new Map([[1, 600]]));
    const { credit, degraded } = await safeGetCredit();
    expect(credit.get(1)).toBe(600);
    expect(degraded).toBe(false);
  });

  it('returns an empty map and flags degradation when Redis throws', async () => {
    getCredit.mockRejectedValue(new Error('connection refused'));
    const { credit, degraded } = await safeGetCredit();
    expect(credit.size).toBe(0);
    expect(degraded).toBe(true);
  });
});

describe('safeGetPayments', () => {
  it('passes the list through when Redis answers', async () => {
    getPayments.mockResolvedValue([{ id: 'tx_1' }]);
    const { payments, degraded } = await safeGetPayments();
    expect(payments).toHaveLength(1);
    expect(degraded).toBe(false);
  });

  it('returns an empty list and flags degradation when Redis throws', async () => {
    getPayments.mockRejectedValue(new Error('connection refused'));
    const { payments, degraded } = await safeGetPayments();
    expect(payments).toEqual([]);
    expect(degraded).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run lib/ledger/safe.test.ts`
Expected: FAIL — `safeGetCredit` / `safeGetPayments` not exported.

- [ ] **Step 3: Implement**

In `lib/ledger/safe.ts`, import `getCredit, getPayments, type PaymentLogEntry` from `./store`, then add:

```typescript
export async function safeGetCredit(): Promise<{ credit: Map<number, number>; degraded: boolean }> {
  try {
    return { credit: await getCredit(), degraded: false };
  } catch (error) {
    console.error('safeGetCredit failed', error);
    return { credit: new Map(), degraded: true };
  }
}

export async function safeGetPayments(): Promise<{ payments: PaymentLogEntry[]; degraded: boolean }> {
  try {
    return { payments: await getPayments(), degraded: false };
  } catch (error) {
    console.error('safeGetPayments failed', error);
    return { payments: [], degraded: true };
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run lib/ledger/safe.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/ledger/safe.ts lib/ledger/safe.test.ts
git commit -m "feat: add safeGetCredit and safeGetPayments"
```

---

### Task 4: `buildBalances` — credit-aware

**Files:**
- Modify: `lib/league/balances.ts`
- Test: `lib/league/balances.test.ts`
- Modify (compile fixes only): `lib/monzo/apply.ts:31`, `app/balances/page.tsx:27-32`

**Interfaces:**
- Consumes: nothing new.
- Produces: `Balance` gains `creditPence: number` (raw balance, 0 for departed). `buildBalances` params gain `credit?: Map<number, number>` (optional — an omitted map means "no credit", so the 20+ existing call sites keep working). `owedPence` becomes `grossOwed − creditPence` and **may be negative**.

- [ ] **Step 1: Write the failing tests**

Add to `lib/league/balances.test.ts`:

```typescript
describe('credit', () => {
  it('subtracts a member’s credit from what they owe, going negative', () => {
    const balances = buildBalances({
      members, results: new Map(), paid: new Set(), buyins: allBoughtIn,
      credit: new Map([[1, 600]]),
    });
    const finn = balances.find((b) => b.member.entryId === 1);
    expect(finn?.owedPence).toBe(-600);
    expect(finn?.creditPence).toBe(600);
  });

  it('nets credit against fine and buy-in debt', () => {
    const balances = buildBalances({
      members, results, paid: new Set(), buyins: new Set(),
      credit: new Map([[1, 1000]]),
    });
    // Finn owes 2 fines (£4) + £20 buy-in = £24; £10 credit → £14 owed.
    expect(balances.find((b) => b.member.entryId === 1)?.owedPence).toBe(1400);
  });

  it('defaults to no credit when the map is omitted', () => {
    const balances = buildBalances({ members, results: new Map(), paid: new Set(), buyins: allBoughtIn });
    expect(balances.every((b) => b.creditPence === 0)).toBe(true);
  });

  it('freezes a departed member’s credit — never shown, never netted', () => {
    const withLeaver = new Map([
      [1, { losers: [99], scores: { 99: 12 }, recordedAt: '2026-09-14T00:00:00Z' }],
    ]);
    const balances = buildBalances({
      members, results: withLeaver, paid: new Set(), buyins: new Set(),
      credit: new Map([[99, 5000]]),
    });
    const leaver = balances.find((b) => b.member.entryId === 99);
    expect(leaver?.creditPence).toBe(0);
    expect(leaver?.owedPence).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run lib/league/balances.test.ts`
Expected: FAIL — `credit` param ignored, `creditPence` undefined, `owedPence` wrong.

- [ ] **Step 3: Implement**

In `lib/league/balances.ts`:

- Add to the `Balance` interface: `/** Raw credit balance in pence; negative = overdrawn. 0 for departed members. */ creditPence: number;`
- Add `credit?: Map<number, number>` to the `buildBalances` params type.
- At the top of the function body: `const credit = params.credit ?? new Map<number, number>();`
- In the `.map((member) => { ... })`, after `const isDeparted = departed.has(member.entryId);`:

```typescript
const creditPence = isDeparted ? 0 : (credit.get(member.entryId) ?? 0);
const grossOwed = unpaid.length * FINE_PENCE + (buyinOwed ? BUYIN_PENCE : 0);
```

- Change the returned object's `owedPence` to `grossOwed - creditPence` and add `creditPence,`. Leave `paidPence` exactly as it is.

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run lib/league/balances.test.ts`
Expected: PASS (new + all existing).

- [ ] **Step 5: Fix the two call sites so the build stays green**

- `lib/monzo/apply.ts:31` — this whole file is rewritten in Task 6, but keep it compiling now: change `buildBalances({ members, results, paid, buyins })` to `buildBalances({ members, results, paid, buyins, credit: new Map() })`.
- `app/balances/page.tsx` — leave as-is (credit param is optional; the real wiring is Task 14).

Run: `npx tsc --noEmit`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/league/balances.ts lib/league/balances.test.ts lib/monzo/apply.ts
git commit -m "feat: net per-member credit against owed balance"
```

---

### Task 5: `buildPot` — count remaining credit

**Files:**
- Modify: `lib/league/pot.ts`
- Test: `lib/league/pot.test.ts`

**Interfaces:**
- Consumes: `Balance.creditPence`, `Balance.paidPence`, `Balance.departed` (Task 4).
- Produces: `Pot` gains `creditPence: number`. `potPence` now includes `Σ max(creditPence, 0)`.

- [ ] **Step 1: Write the failing tests**

In `lib/league/pot.test.ts`, add `creditPence: 0` to the `balance()` helper defaults, then add:

```typescript
it('adds remaining credit to the pot total', () => {
  const pot = buildPot([
    balance(1, { paidPence: 2000, buyinOwed: false, creditPence: 400 }),
    balance(2, { paidPence: 200 }),
  ]);
  expect(pot.potPence).toBe(2600);
  expect(pot.creditPence).toBe(400);
});

it('ignores an overdrawn (negative) credit balance in the pot', () => {
  const pot = buildPot([balance(1, { paidPence: 2000, buyinOwed: false, creditPence: -300 })]);
  expect(pot.potPence).toBe(2000);
  expect(pot.creditPence).toBe(0);
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run lib/league/pot.test.ts`
Expected: FAIL — `pot.creditPence` undefined, `potPence` excludes credit.

- [ ] **Step 3: Implement**

In `lib/league/pot.ts`:

```typescript
export interface Pot {
  potPence: number;
  buyinsPaid: number;
  buyinsTotal: number;
  /** Unspent credit currently banked — physically in the account, so in the pot. */
  creditPence: number;
}

export function buildPot(balances: Balance[]): Pot {
  const current = balances.filter((balance) => !balance.departed);
  const creditPence = balances.reduce((sum, b) => sum + Math.max(b.creditPence, 0), 0);

  return {
    potPence: balances.reduce((sum, b) => sum + b.paidPence, 0) + creditPence,
    buyinsPaid: current.filter((balance) => !balance.buyinOwed).length,
    buyinsTotal: current.length,
    creditPence,
  };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run lib/league/pot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/league/pot.ts lib/league/pot.test.ts
git commit -m "feat: count banked credit toward the pot"
```

---

### Task 6: `applyPayment` — replace `applyIfOwed`

**Files:**
- Rewrite: `lib/monzo/apply.ts`
- Rewrite: `lib/monzo/apply.test.ts`
- Modify: `lib/monzo/matcher.ts` (delete `planApplication`)
- Modify: `lib/monzo/matcher.test.ts` (delete the `planApplication` describe block)

**Interfaces:**
- Consumes: `planWaterfall` (Task 2), `buildBalances` (Task 4), `safeGetCredit` (Task 3), `setCredit` / `appendPayment` (Task 1), `safeGetPaid` / `safeGetResults` / `safeGetBuyins`, `setPaid` / `setBuyin`.
- Produces: `applyPayment(params: { entryId: number; amountPence: number; txId: string; receivedAt: string; members: Member[] }): Promise<PaymentAllocation>`. `applyIfOwed` and `planApplication` no longer exist.

- [ ] **Step 1: Write the failing tests**

Replace `lib/monzo/apply.test.ts` with:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@/lib/league/members';

const safeGetBuyins = vi.fn();
const safeGetPaid = vi.fn();
const safeGetResults = vi.fn();
const safeGetCredit = vi.fn();
const setPaid = vi.fn();
const setBuyin = vi.fn();
const setCredit = vi.fn();
const appendPayment = vi.fn();

vi.mock('@/lib/ledger/safe', () => ({ safeGetBuyins, safeGetPaid, safeGetResults, safeGetCredit }));
vi.mock('@/lib/ledger/store', () => ({
  setPaid, setBuyin, setCredit, appendPayment,
  paidKey: (gameweek: number, entryId: number) => `${gameweek}:${entryId}`,
}));

const { applyPayment } = await import('./apply');

function member(entryId: number, teamName: string): Member {
  return { entryId, managerName: teamName, teamName, joinedTime: null };
}
const members: Member[] = [member(1, 'Team A')];

function loss(gw: number) {
  return [gw, { losers: [1], scores: { 1: -10 }, recordedAt: '' }] as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  safeGetPaid.mockResolvedValue({ paid: new Set(), degraded: false });
  safeGetBuyins.mockResolvedValue({ buyins: new Set([1]), degraded: false });
  safeGetResults.mockResolvedValue({ results: new Map(), degraded: false });
  safeGetCredit.mockResolvedValue({ credit: new Map(), degraded: false });
});

describe('applyPayment', () => {
  it('banks a payment as credit when nothing is owed', async () => {
    const allocation = await applyPayment({
      entryId: 1, amountPence: 600, txId: 'tx_1', receivedAt: 'now', members,
    });
    expect(allocation).toEqual({ fineGameweeks: [], buyin: false, creditDeltaPence: 600 });
    expect(setCredit).toHaveBeenCalledWith(1, 600);
    expect(setPaid).not.toHaveBeenCalled();
  });

  it('pays the oldest fines and banks the remainder', async () => {
    safeGetResults.mockResolvedValue({ results: new Map([loss(3), loss(5)]), degraded: false });
    const allocation = await applyPayment({
      entryId: 1, amountPence: 600, txId: 'tx_2', receivedAt: 'now', members,
    });
    expect(allocation.fineGameweeks).toEqual([3, 5]);
    expect(setPaid).toHaveBeenCalledWith(3, 1, true);
    expect(setPaid).toHaveBeenCalledWith(5, 1, true);
    expect(setCredit).toHaveBeenCalledWith(1, 200);
  });

  it('flips the buy-in for a £20 payment from someone who owes no fines', async () => {
    safeGetBuyins.mockResolvedValue({ buyins: new Set(), degraded: false });
    const allocation = await applyPayment({
      entryId: 1, amountPence: 2000, txId: 'tx_3', receivedAt: 'now', members,
    });
    expect(allocation.buyin).toBe(true);
    expect(setBuyin).toHaveBeenCalledWith(1, true);
  });

  it('writes a payment-log entry with the allocation', async () => {
    await applyPayment({ entryId: 1, amountPence: 600, txId: 'tx_4', receivedAt: '2026-08-30T00:00:00Z', members });
    expect(appendPayment).toHaveBeenCalledWith({
      id: 'tx_4', entryId: 1, amountPence: 600, source: 'monzo',
      receivedAt: '2026-08-30T00:00:00Z',
      allocation: { fineGameweeks: [], buyin: false, creditDeltaPence: 600 },
    });
  });

  it('logs rather than throws when a store write fails', async () => {
    setCredit.mockRejectedValue(new Error('store down'));
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const allocation = await applyPayment({
      entryId: 1, amountPence: 600, txId: 'tx_5', receivedAt: 'now', members,
    });
    expect(allocation.creditDeltaPence).toBe(600);
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run lib/monzo/apply.test.ts`
Expected: FAIL — `applyPayment` not exported.

- [ ] **Step 3: Rewrite `lib/monzo/apply.ts`**

```typescript
import { buildBalances } from '@/lib/league/balances';
import type { Member } from '@/lib/league/members';
import { safeGetBuyins, safeGetCredit, safeGetPaid, safeGetResults } from '@/lib/ledger/safe';
import { appendPayment, setBuyin, setCredit, setPaid } from '@/lib/ledger/store';
import { planWaterfall, type PaymentAllocation } from '@/lib/ledger/waterfall';

/**
 * Applies one incoming payment for a known member: pays their oldest unpaid
 * fines, flips the buy-in if a full £20 is covered, and banks any remainder
 * as credit. The single entry point for both the webhook auto-apply path and
 * the pending-queue Approve action, so both obey the same waterfall.
 *
 * Persistence spans four Redis keys with no transaction; a mid-write failure
 * is logged, not thrown — the caller (a webhook ack or an admin click) must
 * not 500, and the payment log / balances make the inconsistency visible.
 */
export async function applyPayment(params: {
  entryId: number;
  amountPence: number;
  txId: string;
  receivedAt: string;
  members: Member[];
}): Promise<PaymentAllocation> {
  const { entryId, amountPence, txId, receivedAt, members } = params;

  const [{ paid }, { results }, { buyins }, { credit }] = await Promise.all([
    safeGetPaid(),
    safeGetResults(),
    safeGetBuyins(),
    safeGetCredit(),
  ]);

  const balances = buildBalances({ members, results, paid, buyins, credit });
  const mine = balances.find((b) => b.member.entryId === entryId);
  const creditPence = mine?.creditPence ?? 0;

  const allocation = planWaterfall({
    amountPence,
    unpaidFines: mine?.unpaid ?? [],
    buyinPaid: !(mine?.buyinOwed ?? true),
    creditPence,
  });

  try {
    await Promise.all([
      ...allocation.fineGameweeks.map((gw) => setPaid(gw, entryId, true)),
      ...(allocation.buyin ? [setBuyin(entryId, true)] : []),
      ...(allocation.creditDeltaPence !== 0
        ? [setCredit(entryId, creditPence + allocation.creditDeltaPence)]
        : []),
    ]);
    await appendPayment({ id: txId, entryId, amountPence, source: 'monzo', receivedAt, allocation });
  } catch (error) {
    console.error('applyPayment failed to persist', { txId, entryId, error });
  }

  return allocation;
}
```

- [ ] **Step 4: Delete `planApplication`**

- In `lib/monzo/matcher.ts`, delete the `ApplyPlan` interface and the `planApplication` function (lines ~86–107).
- In `lib/monzo/matcher.test.ts`, delete the `describe('planApplication', ...)` block and remove `planApplication` from the import on line 3.

- [ ] **Step 5: Run tests, verify they pass**

Run: `npx vitest run lib/monzo/apply.test.ts lib/monzo/matcher.test.ts`
Expected: PASS. Then `npx tsc --noEmit` — this WILL fail in `app/api/monzo/webhook/route.ts` and `app/api/monzo/pending/route.ts` (they still import `applyIfOwed`). That is expected; Tasks 9 and 10 fix them. To keep the tree buildable between tasks, do a temporary shim: in both route files replace `applyIfOwed(x)` call sites with `applyPayment({ ...x, txId: 'temp', receivedAt: new Date().toISOString() })` and adjust the import — OR sequence Tasks 6→9→10 without an intermediate build. **Recommended:** do Tasks 6, 9, 10 back-to-back and only run `next build` after Task 10.

- [ ] **Step 6: Commit**

```bash
git add lib/monzo/apply.ts lib/monzo/apply.test.ts lib/monzo/matcher.ts lib/monzo/matcher.test.ts
git commit -m "feat: replace applyIfOwed with waterfall-based applyPayment"
```

---

### Task 7: `reconcileCredit` — chase newly-recorded fines

**Files:**
- Create: `lib/ledger/credit.ts`
- Test: `lib/ledger/credit.test.ts`
- Modify: `lib/league/checkAndNotify.ts` (call it after recording)

**Interfaces:**
- Consumes: `buildBalances` (Task 4), the `safe*` getters, `setPaid` / `setCredit` / `appendPayment` (Task 1), `randomUUID` from `node:crypto`.
- Produces: `reconcileCredit(members: Member[]): Promise<void>`.

- [ ] **Step 1: Write the failing tests**

`lib/ledger/credit.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@/lib/league/members';

const safeGetBuyins = vi.fn();
const safeGetPaid = vi.fn();
const safeGetResults = vi.fn();
const safeGetCredit = vi.fn();
const setPaid = vi.fn();
const setCredit = vi.fn();
const appendPayment = vi.fn();

vi.mock('@/lib/ledger/safe', () => ({ safeGetBuyins, safeGetPaid, safeGetResults, safeGetCredit }));
vi.mock('./store', () => ({ setPaid, setCredit, appendPayment, paidKey: (g: number, e: number) => `${g}:${e}` }));

const { reconcileCredit } = await import('./credit');

function member(entryId: number): Member {
  return { entryId, managerName: `M${entryId}`, teamName: `T${entryId}`, joinedTime: null };
}
const members = [member(1), member(2)];

function loss(gw: number, who: number) {
  return [gw, { losers: [who], scores: { [who]: -5 }, recordedAt: '' }] as const;
}

beforeEach(() => {
  vi.clearAllMocks();
  safeGetPaid.mockResolvedValue({ paid: new Set(), degraded: false });
  safeGetBuyins.mockResolvedValue({ buyins: new Set([1, 2]), degraded: false });
  safeGetResults.mockResolvedValue({ results: new Map(), degraded: false });
  safeGetCredit.mockResolvedValue({ credit: new Map(), degraded: false });
});

describe('reconcileCredit', () => {
  it('pays a member’s unpaid fine from their banked credit, oldest first', async () => {
    safeGetResults.mockResolvedValue({ results: new Map([loss(3, 1), loss(4, 1)]), degraded: false });
    safeGetCredit.mockResolvedValue({ credit: new Map([[1, 200]]), degraded: false });

    await reconcileCredit(members);

    expect(setPaid).toHaveBeenCalledExactlyOnceWith(3, 1, true);
    expect(setCredit).toHaveBeenCalledWith(1, 0);
    expect(appendPayment).toHaveBeenCalledWith(expect.objectContaining({
      source: 'credit-chase', entryId: 1, amountPence: 0,
      allocation: { fineGameweeks: [3], buyin: false, creditDeltaPence: -200 },
    }));
  });

  it('clears several fines in one chase entry when credit covers them', async () => {
    safeGetResults.mockResolvedValue({ results: new Map([loss(3, 1), loss(4, 1)]), degraded: false });
    safeGetCredit.mockResolvedValue({ credit: new Map([[1, 400]]), degraded: false });

    await reconcileCredit(members);

    expect(setPaid).toHaveBeenCalledTimes(2);
    expect(appendPayment).toHaveBeenCalledWith(expect.objectContaining({
      allocation: { fineGameweeks: [3, 4], buyin: false, creditDeltaPence: -400 },
    }));
  });

  it('does nothing when a member has credit but no unpaid fines', async () => {
    safeGetCredit.mockResolvedValue({ credit: new Map([[1, 600]]), degraded: false });
    await reconcileCredit(members);
    expect(setPaid).not.toHaveBeenCalled();
    expect(appendPayment).not.toHaveBeenCalled();
  });

  it('does nothing when a member has unpaid fines but no credit', async () => {
    safeGetResults.mockResolvedValue({ results: new Map([loss(3, 1)]), degraded: false });
    await reconcileCredit(members);
    expect(setPaid).not.toHaveBeenCalled();
  });

  it('never touches the buy-in', async () => {
    safeGetBuyins.mockResolvedValue({ buyins: new Set(), degraded: false });
    safeGetResults.mockResolvedValue({ results: new Map([loss(3, 1)]), degraded: false });
    safeGetCredit.mockResolvedValue({ credit: new Map([[1, 5000]]), degraded: false });

    await reconcileCredit(members);

    // Only the one fine is paid; the £48 left is NOT spent on the buy-in here.
    expect(setCredit).toHaveBeenCalledWith(1, 4800);
    expect(appendPayment).toHaveBeenCalledWith(expect.objectContaining({
      allocation: expect.objectContaining({ buyin: false }),
    }));
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run lib/ledger/credit.test.ts`
Expected: FAIL — `./credit` not found.

- [ ] **Step 3: Implement `lib/ledger/credit.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import { FINE_PENCE } from '@/lib/config';
import { buildBalances } from '@/lib/league/balances';
import type { Member } from '@/lib/league/members';
import { safeGetBuyins, safeGetCredit, safeGetPaid, safeGetResults } from './safe';
import { appendPayment, setCredit, setPaid } from './store';

/**
 * Restores the waterfall invariant (`credit > 0` ⟹ no unpaid fines) by
 * spending any member's banked credit on their unpaid fines, oldest first.
 * Called after a gameweek is recorded — a new fine against someone holding
 * credit should land already paid. Never touches the buy-in (spec §5).
 *
 * Each member's writes are independent; one failing is logged and the rest
 * proceed.
 */
export async function reconcileCredit(members: Member[]): Promise<void> {
  const [{ paid }, { results }, { buyins }, { credit }] = await Promise.all([
    safeGetPaid(),
    safeGetResults(),
    safeGetBuyins(),
    safeGetCredit(),
  ]);

  const balances = buildBalances({ members, results, paid, buyins, credit });

  for (const balance of balances) {
    if (balance.departed || balance.creditPence <= 0 || balance.unpaid.length === 0) continue;

    const affordable = Math.floor(balance.creditPence / FINE_PENCE);
    const fineGameweeks = balance.unpaid.slice(0, affordable);
    if (fineGameweeks.length === 0) continue;

    const spent = fineGameweeks.length * FINE_PENCE;
    const entryId = balance.member.entryId;

    try {
      await Promise.all(fineGameweeks.map((gw) => setPaid(gw, entryId, true)));
      await setCredit(entryId, balance.creditPence - spent);
      await appendPayment({
        id: `chase:${randomUUID()}`,
        entryId,
        amountPence: 0,
        source: 'credit-chase',
        receivedAt: new Date().toISOString(),
        allocation: { fineGameweeks, buyin: false, creditDeltaPence: -spent },
      });
    } catch (error) {
      console.error('reconcileCredit failed for entry', entryId, error);
    }
  }
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run lib/ledger/credit.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire into `checkAndNotifySettled`**

In `lib/league/checkAndNotify.ts`, import `reconcileCredit` from `@/lib/ledger/credit`, then after the `safeRecordSettledGameweeks` call and before the `after(...)` block:

```typescript
if (newlyRecorded.length > 0) {
  await reconcileCredit(members).catch((error) => console.error('reconcileCredit failed', error));
}
```

Run: `npx vitest run` (whole suite) and `npx tsc --noEmit`.
Expected: suite PASS, tsc clean (Task 6's route breakage aside — if doing 6/9/10 back-to-back, run tsc after 10).

- [ ] **Step 6: Commit**

```bash
git add lib/ledger/credit.ts lib/ledger/credit.test.ts lib/league/checkAndNotify.ts
git commit -m "feat: chase newly-recorded fines with banked credit"
```

---

### Task 8: `reversePayment`

**Files:**
- Create: `lib/ledger/reverse.ts`
- Test: `lib/ledger/reverse.test.ts`

**Interfaces:**
- Consumes: `getPayments` / `appendPayment` / `setPaid` / `setBuyin` / `setCredit` from `./store`, `safeGetCredit` from `./safe`, `appendPending` + `PendingMatch` from `@/lib/monzo/store`, `Member` from `@/lib/league/members`, `randomUUID`.
- Produces: `reversePayment(paymentId: string, members: Member[]): Promise<{ ok: true } | { ok: false; reason: string }>`.

- [ ] **Step 1: Write the failing tests**

`lib/ledger/reverse.test.ts`:

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Member } from '@/lib/league/members';

const getPayments = vi.fn();
const appendPayment = vi.fn();
const setPaid = vi.fn();
const setBuyin = vi.fn();
const setCredit = vi.fn();
const safeGetCredit = vi.fn();
const appendPending = vi.fn();

vi.mock('./store', () => ({ getPayments, appendPayment, setPaid, setBuyin, setCredit }));
vi.mock('./safe', () => ({ safeGetCredit }));
vi.mock('@/lib/monzo/store', () => ({ appendPending }));

const { reversePayment } = await import('./reverse');

const members: Member[] = [{ entryId: 1, managerName: 'A', teamName: 'Team A', joinedTime: null }];

function logEntry(overrides = {}) {
  return {
    id: 'tx_1', entryId: 1, amountPence: 2000, source: 'monzo', receivedAt: 'then',
    allocation: { fineGameweeks: [3, 4], buyin: true, creditDeltaPence: 1200 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  safeGetCredit.mockResolvedValue({ credit: new Map([[1, 1200]]), degraded: false });
  getPayments.mockResolvedValue([logEntry()]);
});

describe('reversePayment', () => {
  it('un-pays the fine gameweeks and the buy-in', async () => {
    await reversePayment('tx_1', members);
    expect(setPaid).toHaveBeenCalledWith(3, 1, false);
    expect(setPaid).toHaveBeenCalledWith(4, 1, false);
    expect(setBuyin).toHaveBeenCalledWith(1, false);
  });

  it('subtracts the payment’s credit delta from the current balance', async () => {
    await reversePayment('tx_1', members);
    expect(setCredit).toHaveBeenCalledWith(1, 0); // 1200 current − 1200 delta
  });

  it('drives the credit balance negative without cascading', async () => {
    safeGetCredit.mockResolvedValue({ credit: new Map([[1, 400]]), degraded: false });
    await reversePayment('tx_1', members);
    expect(setCredit).toHaveBeenCalledWith(1, -800);
  });

  it('re-queues a "reversed" pending entry for the original member', async () => {
    await reversePayment('tx_1', members);
    expect(appendPending).toHaveBeenCalledWith(expect.objectContaining({
      id: 'reversed:tx_1', reason: 'reversed',
      candidates: [{ entryId: 1, teamName: 'Team A' }],
    }));
  });

  it('appends a reversal audit entry', async () => {
    await reversePayment('tx_1', members);
    expect(appendPayment).toHaveBeenCalledWith(expect.objectContaining({
      source: 'reversal', entryId: 1,
      allocation: { fineGameweeks: [3, 4], buyin: true, creditDeltaPence: -1200 },
    }));
  });

  it('refuses an unknown payment id', async () => {
    expect(await reversePayment('nope', members)).toEqual({ ok: false, reason: 'not found' });
  });

  it('refuses to reverse a non-webhook entry', async () => {
    getPayments.mockResolvedValue([logEntry({ id: 'chase:x', source: 'credit-chase' })]);
    const result = await reversePayment('chase:x', members);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run lib/ledger/reverse.test.ts`
Expected: FAIL — `./reverse` not found.

- [ ] **Step 3: Implement `lib/ledger/reverse.ts`**

```typescript
import { randomUUID } from 'node:crypto';
import type { Member } from '@/lib/league/members';
import { appendPending } from '@/lib/monzo/store';
import { safeGetCredit } from './safe';
import { appendPayment, getPayments, setBuyin, setCredit, setPaid } from './store';

/**
 * Undoes one webhook payment's allocation: un-pays its fine gameweeks and
 * buy-in, and subtracts its credit delta from the current balance — which
 * may go negative ("overdrawn"). No cascade: a later credit-chase that spent
 * this payment's banked credit is left alone for the admin (spec §8, Q15a).
 * Re-queues a 'reversed' pending entry so the payment can be re-attributed.
 */
export async function reversePayment(
  paymentId: string,
  members: Member[],
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const entry = (await getPayments()).find((p) => p.id === paymentId);
  if (!entry) return { ok: false, reason: 'not found' };
  if (entry.source !== 'monzo') {
    return { ok: false, reason: 'only webhook payments can be reversed' };
  }

  const { credit } = await safeGetCredit();
  const current = credit.get(entry.entryId) ?? 0;
  const { fineGameweeks, buyin, creditDeltaPence } = entry.allocation;
  const teamName = members.find((m) => m.entryId === entry.entryId)?.teamName ?? `Entry ${entry.entryId}`;
  const now = new Date().toISOString();

  try {
    await Promise.all([
      ...fineGameweeks.map((gw) => setPaid(gw, entry.entryId, false)),
      ...(buyin ? [setBuyin(entry.entryId, false)] : []),
      ...(creditDeltaPence !== 0 ? [setCredit(entry.entryId, current - creditDeltaPence)] : []),
    ]);
    // NOTE (as-built): the audit id is deterministic — `reversal:${entry.id}` —
    // so a second reverse of the same payment is detectable and refused.
    await appendPayment({
      id: `reversal:${entry.id}`,
      entryId: entry.entryId,
      amountPence: entry.amountPence,
      source: 'reversal',
      receivedAt: now,
      allocation: { fineGameweeks, buyin, creditDeltaPence: -creditDeltaPence },
    });
    await appendPending({
      id: `reversed:${entry.id}`,
      receivedAt: now,
      amountPence: entry.amountPence,
      counterpartyName: `${teamName} (reversed)`,
      reason: 'reversed',
      candidates: [{ entryId: entry.entryId, teamName }],
    });
  } catch (error) {
    console.error('reversePayment failed', paymentId, error);
    return { ok: false, reason: 'store error' };
  }

  return { ok: true };
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run lib/ledger/reverse.test.ts`
Expected: PASS. (`appendPending` will need `'reversed'` in `PendingReason` — Task 9 does that; until then `tsc` flags the literal. If running out of order, temporarily cast. Recommended order keeps 8 after 9, or accept the transient tsc error resolved by Task 9.)

- [ ] **Step 5: Commit**

```bash
git add lib/ledger/reverse.ts lib/ledger/reverse.test.ts
git commit -m "feat: add reversePayment to undo a matched payment"
```

---

### Task 9: Matcher relax + `PendingReason` + webhook routing

**Files:**
- Modify: `lib/monzo/matcher.ts` (`extractEligibleCredit` — stop rejecting odd amounts)
- Modify: `lib/monzo/matcher.test.ts`
- Modify: `lib/monzo/store.ts` (`PendingReason` union)
- Modify: `lib/config.ts` (`WEBHOOK_AUTO_APPLY_CAP_PENCE`)
- Rewrite: `app/api/monzo/webhook/route.ts` (routing logic)

**Interfaces:**
- Consumes: `applyPayment` (Task 6).
- Produces: `PendingReason = 'ambiguous' | 'no-match' | 'unusual' | 'reversed'`. `extractEligibleCredit` returns any positive, non-load, non-declined credit with a counterparty name (no £2-multiple check).

- [ ] **Step 1: Update the matcher test (RED)**

In `lib/monzo/matcher.test.ts`, replace the `'rejects an amount that is not a multiple of the fine'` test with:

```typescript
it('returns an odd amount so the queue can flag it', () => {
  expect(extractEligibleCredit({ ...base, amount: 250 })).toEqual({
    txId: 'tx_1', amountPence: 250, counterpartyName: 'ALEXANDER MCGUINESS',
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npx vitest run lib/monzo/matcher.test.ts`
Expected: FAIL — currently returns `null` for 250.

- [ ] **Step 3: Relax `extractEligibleCredit`**

In `lib/monzo/matcher.ts`, delete the line `if (tx.amount % FINE_PENCE !== 0) return null;`. Update the function's doc comment to note odd amounts are now surfaced by the webhook as `'unusual'`, not dropped. Remove the now-unused `FINE_PENCE` import if nothing else in the file uses it (it does not, after `planApplication` was deleted in Task 6).

- [ ] **Step 4: Run test, verify it passes**

Run: `npx vitest run lib/monzo/matcher.test.ts`
Expected: PASS.

- [ ] **Step 5: `PendingReason` + config constant**

- `lib/monzo/store.ts`: `export type PendingReason = 'ambiguous' | 'no-match' | 'unusual' | 'reversed';`
- `lib/config.ts`, near `BUYIN_PENCE`:

```typescript
/**
 * A clean name-match above this auto-applies unattended; anything larger
 * lands in the pending queue as 'unusual' for the admin to eyeball. The
 * largest plausible legit payment is a buy-in plus a season of fines, well
 * under this.
 */
export const WEBHOOK_AUTO_APPLY_CAP_PENCE = 10000;
```

- [ ] **Step 6: Rewrite the webhook routing**

Replace the body of `app/api/monzo/webhook/route.ts` from `const match = matchSender(...)` onward:

```typescript
  const match = matchSender(credit.counterpartyName, members, aliasedEntryId);
  const now = new Date().toISOString();

  if (match.outcome === 'no-match') {
    await queuePending({
      id: credit.txId, receivedAt: now, amountPence: credit.amountPence,
      counterpartyName: credit.counterpartyName, reason: 'no-match', candidates: [],
    });
    return NextResponse.json({ ok: true });
  }

  if (match.outcome === 'ambiguous') {
    await queuePending({
      id: credit.txId, receivedAt: now, amountPence: credit.amountPence,
      counterpartyName: credit.counterpartyName, reason: 'ambiguous',
      candidates: match.members.map((m) => ({ entryId: m.entryId, teamName: m.teamName })),
    });
    return NextResponse.json({ ok: true });
  }

  const isUnusual =
    credit.amountPence > WEBHOOK_AUTO_APPLY_CAP_PENCE || credit.amountPence % FINE_PENCE !== 0;

  if (isUnusual) {
    await queuePending({
      id: credit.txId, receivedAt: now, amountPence: credit.amountPence,
      counterpartyName: credit.counterpartyName, reason: 'unusual',
      candidates: [{ entryId: match.member.entryId, teamName: match.member.teamName }],
    });
    return NextResponse.json({ ok: true });
  }

  try {
    await applyPayment({
      entryId: match.member.entryId,
      amountPence: credit.amountPence,
      txId: credit.txId,
      receivedAt: now,
      members,
    });
  } catch (error) {
    console.error('applyPayment failed during Monzo matching', error);
  }

  return NextResponse.json({ ok: true });
```

Update imports: drop `applyIfOwed`, add `applyPayment` from `@/lib/monzo/apply`; add `FINE_PENCE, WEBHOOK_AUTO_APPLY_CAP_PENCE` from `@/lib/config`. Delete the now-unused `resolveMembers`/`fetchStandings`? No — still needed for `members`. Delete the old `no-debt` branch entirely.

- [ ] **Step 7: Verify**

Run: `npx vitest run` and `npx tsc --noEmit`.
Expected: suite PASS; tsc clean except `app/api/monzo/pending/route.ts` (Task 10).

- [ ] **Step 8: Commit**

```bash
git add lib/monzo/matcher.ts lib/monzo/matcher.test.ts lib/monzo/store.ts lib/config.ts app/api/monzo/webhook/route.ts
git commit -m "feat: route odd/large payments to an 'unusual' pending reason"
```

---

### Task 10: Pending-queue Approve → `applyPayment`

**Files:**
- Modify: `app/api/monzo/pending/route.ts`

**Interfaces:**
- Consumes: `applyPayment` (Task 6).
- Produces: no signature change to the route; `POST` now runs the full waterfall.

- [ ] **Step 1: Rewrite the `POST` handler body**

In `app/api/monzo/pending/route.ts`, swap the import `applyIfOwed` → `applyPayment`, and change the `POST` handler's try block:

```typescript
    const pending = await getPending();
    const entry = pending.find((p) => p.id === id);
    if (!entry) {
      return NextResponse.json({ error: 'not found — it may already be resolved' }, { status: 404 });
    }

    // A re-queued reversal has a synthetic counterparty; don't teach the
    // aliaser that string.
    if (!entry.id.startsWith('reversed:')) {
      await saveAlias(normalizeName(entry.counterpartyName), entryId);
    }

    const standings = await fetchStandings(0);
    const members = resolveMembers(standings);
    const allocation = await applyPayment({
      entryId,
      amountPence: entry.amountPence,
      txId: entry.id,
      receivedAt: entry.receivedAt,
      members,
    });

    await dismissPending(id);

    return NextResponse.json({ ok: true, ...allocation });
```

- [ ] **Step 2: Verify the whole tree builds**

Run: `npx vitest run` then `npx tsc --noEmit` then `npx next build`.
Expected: all green (font warning from `next build` is pre-existing, ignore).

- [ ] **Step 3: Commit**

```bash
git add app/api/monzo/pending/route.ts
git commit -m "feat: run the payment waterfall when approving a pending match"
```

---

### Task 11: `reasons.ts` + `PendingQueue` — every card is approvable

**Files:**
- Modify: `app/components/admin/reasons.ts`
- Modify: `app/components/admin/PendingQueue.tsx`

**Interfaces:**
- Produces: `reasonInfo(reason: string): ReasonInfo` — a lookup with a fallback for unknown reasons (so pre-deploy `'no-debt'` entries still render).

- [ ] **Step 1: Rewrite `reasons.ts`**

```typescript
import type { PendingReason } from '@/lib/monzo/store';
import classes from './AdminPanel.module.scss';

interface ReasonInfo {
  detail: string;
  tag: string;
  tone: string;
}

const REASONS: Record<PendingReason, ReasonInfo> = {
  ambiguous: {
    detail: 'Name matched more than one member',
    tag: 'Ambiguous',
    tone: classes.ambiguous,
  },
  'no-match': {
    detail: "Sender name didn't match any member",
    tag: 'No match',
    tone: classes.noMatch,
  },
  unusual: {
    detail: 'Unusual amount — check before applying',
    tag: 'Unusual',
    tone: classes.ambiguous,
  },
  reversed: {
    detail: 'Payment reversed — re-attribute or remove',
    tag: 'Reversed',
    tone: classes.noDebt,
  },
};

const FALLBACK: ReasonInfo = { detail: 'Needs review', tag: 'Review', tone: classes.noMatch };

/** Tolerates reason strings not in the union — e.g. 'no-debt' entries still
 *  in the live queue from before that reason was removed. */
export function reasonInfo(reason: string): ReasonInfo {
  return (REASONS as Record<string, ReasonInfo>)[reason] ?? FALLBACK;
}
```

- [ ] **Step 2: Update `PendingQueue.tsx`**

- Import `reasonInfo` instead of `REASONS`.
- Replace `const { detail, tag, tone } = REASONS[entry.reason];` with `const { detail, tag, tone } = reasonInfo(entry.reason);`
- Delete `const canApprove = entry.reason !== 'no-debt';`
- Change the options line to: `const options = (entry.reason === 'ambiguous' ? entry.candidates : members).map((c) => ({ value: String(c.entryId), label: c.teamName }));`
- Remove the `{canApprove && ( ... )}` wrapper so the `<Select>` + Approve `<Button>` always render.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` then `npx next build`.
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add app/components/admin/reasons.ts app/components/admin/PendingQueue.tsx
git commit -m "feat: allow approving every pending reason, with an unknown-reason fallback"
```

---

### Task 12: Admin routes — payments list & reverse

**Files:**
- Create: `app/api/admin/payments/route.ts`
- Create: `app/api/admin/reverse-payment/route.ts`

**Interfaces:**
- Consumes: `getPayments` (Task 1), `reversePayment` (Task 8), `withAdminAuth` / `parseJsonBody`, `fetchStandings` / `resolveMembers`.
- Produces: `GET /api/admin/payments` → `{ payments: PaymentLogEntry[] }`; `POST /api/admin/reverse-payment` `{ paymentId: string }` → `{ ok: true }` or `{ error }`.

- [ ] **Step 1: `app/api/admin/payments/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { withAdminAuth } from '@/lib/api/guards';
import { getPayments } from '@/lib/ledger/store';

export const GET = withAdminAuth(async () => {
  try {
    return NextResponse.json({ payments: await getPayments() });
  } catch (error) {
    console.error('getPayments failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }
});
```

- [ ] **Step 2: `app/api/admin/reverse-payment/route.ts`**

```typescript
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { parseJsonBody, withAdminAuth } from '@/lib/api/guards';
import { fetchStandings } from '@/lib/fpl/client';
import { resolveMembers } from '@/lib/league/members';
import { reversePayment } from '@/lib/ledger/reverse';

const bodySchema = z.object({ paymentId: z.string() });

export const POST = withAdminAuth(async (request) => {
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    const members = resolveMembers(await fetchStandings(0));
    const result = await reversePayment(parsed.data.paymentId, members);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('reverse-payment failed', error);
    return NextResponse.json({ error: 'store unavailable' }, { status: 503 });
  }
});
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` then `npx next build`.
Expected: both routes appear in the build output under `ƒ /api/admin/...`.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/payments/route.ts app/api/admin/reverse-payment/route.ts
git commit -m "feat: admin routes to list and reverse payments"
```

---

### Task 13: `RecentPayments` component

**Files:**
- Create: `app/components/admin/RecentPayments.tsx`
- Modify: `app/components/admin/AdminPanel.tsx` (mount it under `PendingQueue`)
- Modify: `app/components/admin/AdminPanel.module.scss` (add minimal row styles — follow existing class naming; a `.paymentRow`, `.paymentMeta`, `.chase` greyed modifier)

**Interfaces:**
- Consumes: `GET /api/admin/payments`, `POST /api/admin/reverse-payment`, `GET /api/monzo/members` (to resolve `entryId` → team name, same as `PendingQueue`), `PaymentLogEntry` type.

- [ ] **Step 1: Build the component**

Model it on `PendingQueue.tsx` (same `pin` prop, same load-on-click pattern, same `fetch` with `x-admin-pin`). Requirements:

- A "View recent payments" button that loads on click.
- For each `PaymentLogEntry`: show `new Date(receivedAt).toLocaleDateString('en-GB')`, the resolved team name (fall back to `Entry {entryId}`), `£{(amountPence/100).toFixed(2)}` (blank for `amountPence === 0`), and an allocation summary built as:
  - fine gameweeks → `GW3, GW4`
  - `+ £X credit` when `allocation.creditDeltaPence > 0`; `− £X credit` when `< 0`
  - `Buy-in` when `allocation.buyin`
  - joined with `· `
- A **Reverse** button only when `source === 'monzo'`; `credit-chase` and `reversal` rows get the `.chase` greyed class and no button.
- Reverse: `POST /api/admin/reverse-payment` with `{ paymentId: entry.id }`; on `res.ok`, refetch the list.

Full implementation:

```tsx
'use client';

import { useState } from 'react';
import { Button, Text } from '@mantine/core';
import type { PaymentLogEntry } from '@/lib/ledger/store';
import type { PendingCandidate } from '@/lib/monzo/store';
import classes from './AdminPanel.module.scss';

function allocationSummary(entry: PaymentLogEntry): string {
  const parts: string[] = [];
  if (entry.allocation.fineGameweeks.length > 0) {
    parts.push(entry.allocation.fineGameweeks.map((gw) => `GW${gw}`).join(', '));
  }
  if (entry.allocation.buyin) parts.push('Buy-in');
  const d = entry.allocation.creditDeltaPence;
  if (d > 0) parts.push(`+ £${(d / 100).toFixed(2)} credit`);
  if (d < 0) parts.push(`− £${(-d / 100).toFixed(2)} credit`);
  return parts.join(' · ') || 'nothing';
}

export function RecentPayments({ pin }: { pin: string }) {
  const [payments, setPayments] = useState<PaymentLogEntry[] | null>(null);
  const [members, setMembers] = useState<PendingCandidate[]>([]);
  const [reversing, setReversing] = useState<string | null>(null);

  async function load() {
    const [payRes, memRes] = await Promise.all([
      fetch('/api/admin/payments', { headers: { 'x-admin-pin': pin } }),
      fetch('/api/monzo/members', { headers: { 'x-admin-pin': pin } }),
    ]);
    setPayments((await payRes.json()).payments ?? []);
    setMembers((await memRes.json()).members ?? []);
  }

  function teamName(entryId: number): string {
    return members.find((m) => m.entryId === entryId)?.teamName ?? `Entry ${entryId}`;
  }

  async function reverse(id: string) {
    setReversing(id);
    try {
      const res = await fetch('/api/admin/reverse-payment', {
        method: 'POST',
        headers: { 'x-admin-pin': pin, 'content-type': 'application/json' },
        body: JSON.stringify({ paymentId: id }),
      });
      if (res.ok) await load();
    } finally {
      setReversing(null);
    }
  }

  if (payments === null) {
    return (
      <div className={classes.actionRow}>
        <Button onClick={load} variant="default" size="xs">
          View recent payments
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className={classes.queueHeading}>
        <span className={classes.queueLabel}>Recent payments</span>
      </div>
      {payments.length === 0 && (
        <Text size="sm" c="dimmed">
          Nothing recorded yet.
        </Text>
      )}
      <div className={classes.queue}>
        {payments.map((entry) => {
          const isMonzo = entry.source === 'monzo';
          return (
            <div
              key={entry.id}
              className={`${classes.pendingCard} ${isMonzo ? '' : classes.chase}`}
            >
              <div className={classes.pendingTop}>
                <div>
                  <div className={classes.pendingAmount}>
                    {entry.amountPence > 0 ? `£${(entry.amountPence / 100).toFixed(2)}` : '—'}
                  </div>
                  <div className={classes.pendingFrom}>
                    {new Date(entry.receivedAt).toLocaleDateString('en-GB')} · {teamName(entry.entryId)}
                  </div>
                </div>
                {isMonzo && (
                  <Button
                    size="xs"
                    variant="subtle"
                    loading={reversing === entry.id}
                    onClick={() => reverse(entry.id)}
                  >
                    Reverse
                  </Button>
                )}
              </div>
              <div className={classes.pendingDetail}>{allocationSummary(entry)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

Add a `.chase { opacity: 0.55; }` rule to `AdminPanel.module.scss` (reusing `.pendingCard` for layout).

- [ ] **Step 2: Mount in `AdminPanel.tsx`**

Import `RecentPayments`, add `<RecentPayments pin={pin} />` directly after `<PendingQueue pin={pin} />`.

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit` then `npx next build`.
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add app/components/admin/RecentPayments.tsx app/components/admin/AdminPanel.tsx app/components/admin/AdminPanel.module.scss
git commit -m "feat: recent-payments list with reverse in the admin panel"
```

---

### Task 14: Balances UI — the credit state

**Files:**
- Modify: `app/balances/page.tsx`
- Modify: `app/components/balances/BalancesTable.tsx`
- Modify: `app/components/balances/BalancesTable.module.scss` (add `.figCredit`)
- Modify: `app/components/balances/YourBalance.tsx`
- Modify: `app/components/balances/YourBalance.module.scss` (add `.credit` if `.owes` styling doesn't suit)

**Interfaces:**
- Consumes: `safeGetCredit` (Task 3), credit-aware `buildBalances` / `buildPot` (Tasks 4–5), `Balance.owedPence` (now possibly negative), `Pot.creditPence` (Task 5).

- [ ] **Step 1: `app/balances/page.tsx`**

- Add `safeGetCredit()` to the `Promise.all` and destructure `{ credit, degraded: creditDegraded }` from a new `creditState`.
- Pass `credit` into `buildBalances({ ... , credit })`.
- Change `const totalOwedPence = balances.reduce((sum, b) => sum + b.owedPence, 0);` to `sum + Math.max(b.owedPence, 0)`.
- Add `!creditDegraded` to the `potReady` condition.
- Add `creditDegraded` to the `(paidDegraded || buyinsDegraded)` alert condition.
- Optionally, in the pot summary line, append ` · {pounds(pot.creditPence)} credit` when `pot.creditPence > 0`.

- [ ] **Step 2: `BalancesTable.tsx`**

- Change the `state` computation:

```tsx
const state = resultsDegraded
  ? 'unknown'
  : balance.owedPence > 0
    ? 'owes'
    : balance.owedPence < 0
      ? 'credit'
      : 'clear';
```

- `toneClass`: add `state === 'credit' ? classes.figCredit : ...` before the `figOwes`/`figUnknown` chain.
- `figure`: `state === 'unknown' ? '—' : pounds(Math.abs(balance.owedPence))`.
- `unit`: `canPay ? 'Pay' : state` already yields `'credit'` for the credit state — good. `canPay` stays `state === 'owes' && Boolean(monzoUrl)`, so a credit row never shows Pay.
- The `classes[state]` on the row wrapper needs a `.credit` rule in the scss — add one mirroring `.clear`.

- [ ] **Step 3: `YourBalance.tsx`**

```tsx
const owes = mine.owedPence > 0;
const inCredit = mine.owedPence < 0;

// label:
{owes
  ? `You owe ${pounds(mine.owedPence)} across ${mine.unpaid.length} week${mine.unpaid.length === 1 ? '' : 's'}`
  : inCredit
    ? `You're ${pounds(Math.abs(mine.owedPence))} in credit`
    : "You're all clear"}
```

Wrapper class: `owes ? \`${classes.line} ${classes.owes}\` : inCredit ? \`${classes.line} ${classes.credit}\` : classes.line`. Add `.credit` to the scss (green accent).

- [ ] **Step 4: `.figCredit` / `.credit` scss**

In `BalancesTable.module.scss`, copy the `.figClear` rule to `.figCredit` and tweak the colour token to a positive/green accent distinct from `.figClear`'s neutral. Same for the `.credit` row rule mirroring `.clear`. In `YourBalance.module.scss` add `.credit` mirroring `.owes` with a positive accent.

- [ ] **Step 5: Verify**

Run: `npx vitest run` then `npx tsc --noEmit` then `npx next build`.
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add app/balances/ app/components/balances/
git commit -m "feat: show a credit balance on the balances page"
```

---

### Task 15: Docs — ADR & CONTEXT.md

**Files:**
- Create: `docs/adr/0001-credit-ledger.md`
- Create: `CONTEXT.md`

- [ ] **Step 1: `docs/adr/0001-credit-ledger.md`**

```markdown
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
```

- [ ] **Step 2: `CONTEXT.md`**

```markdown
# Evicted — domain context

FPL mini-league money tracker. Two leagues share the same friend group: the
classic league `79294` (real money — £2 per gameweek finished bottom, plus a
£20 season buy-in, all into the pot) and a no-money draft league `77196`.

## Glossary

- **Fine** — £2 (`FINE_PENCE`) owed by whoever posts the lowest *net* score in
  a settled gameweek. Ties: everyone tied pays.
- **Buy-in** — the one-off £20 (`BUYIN_PENCE`) season entry. **Binary**: a
  member has paid it or not; there is no partial buy-in.
- **Pot** — every fine actually collected, plus every buy-in paid, plus every
  member's remaining **credit**.
- **Credit** — a per-member balance of money received beyond what they owed.
  Auto-applied to their future fines, shown as a negative on `/balances`,
  counted in the pot. Steady-state invariant: a member with positive credit
  has no unpaid fines. May go negative ("overdrawn") only after a payment
  reversal.
- **Payment waterfall** — how one incoming payment is split:
  oldest unpaid fines → buy-in → bank the remainder as credit
  (`planWaterfall`).
- **Credit-chase** — when a new fine is recorded against a member holding
  credit, `reconcileCredit` spends the credit to pay it, oldest first.
- **Settled gameweek** — one FPL reports as both `finished` and
  `data_checked`; only then is a result recorded and a fine owed.
- **Departed member** — someone no longer in the league standings who still
  owes fine debt. Never charged a buy-in retroactively; their credit is
  frozen (not shown, not potted).

## Stores (Upstash Redis)

- `evicted:results` — recorded gameweek results (authoritative)
- `evicted:paid` — set of `"gw:entry"` fine payments (authoritative)
- `evicted:buyin` — set of entry ids that have paid the buy-in (authoritative)
- `evicted:credit` — hash entry id → pence (authoritative)
- `evicted:payments` — append-only payment log (audit / reversal only)
- `evicted:monzo:*` — OAuth tokens, capture log, pending queue, sender aliases

## Key decisions

- `docs/adr/0001-credit-ledger.md` — why credit exists and why the payment
  log is not authoritative.
```

- [ ] **Step 3: Commit**

```bash
git add docs/adr/0001-credit-ledger.md CONTEXT.md
git commit -m "docs: ADR and CONTEXT.md for the credit ledger"
```

---

## Self-Review

**1. Spec coverage:**

| Spec section | Task |
|---|---|
| §3 `evicted:credit`, `evicted:payments`, `PaymentLogEntry` | 1 |
| §4 `planWaterfall` | 2 |
| §5 `applyPayment`, delete `planApplication` | 6 |
| §5 `reconcileCredit` + wiring | 7 |
| §6 `extractEligibleCredit` relax, precedence, `unusual`, £100 cap, `PendingReason` | 9 |
| §7 pending queue Approve, `canApprove` removal, alias | 10, 11 |
| §7 "how Struan's £20 resolves" | covered by 2 (test) + 6 + 10 |
| §8 `reversePayment`, `reversed` reason, no cascade | 8 |
| §9 `/api/admin/payments`, `/api/admin/reverse-payment`, `RecentPayments` | 12, 13 |
| §10 `buildBalances` credit, `buildPot`, `BalancesTable`, `YourBalance`, outstanding clamp, departed frozen | 4, 5, 14 |
| §10 `safeGetCredit` | 3 |
| §11 test matrix | 2, 4, 5, 6, 7, 8, 9 |
| §12 rollout, `REASONS` fallback | 11 |
| §12.5 ADR + CONTEXT.md | 15 |

No gaps.

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N" — every code step carries real code. Task 13 gives the full component; Task 14's scss steps name the exact classes to copy.

**3. Type consistency:** `PaymentAllocation` (Task 2) is the return type of `planWaterfall` and `applyPayment` (Task 6) and the `allocation` shape inside `PaymentLogEntry` (Task 1) — all `{ fineGameweeks: number[]; buyin: boolean; creditDeltaPence: number }`. `Balance.creditPence` (Task 4) is read by `buildPot` (Task 5), `applyPayment` (Task 6), `reconcileCredit` (Task 7). `reversePayment(paymentId, members)` (Task 8) is called with exactly those args by Task 12. `reasonInfo` (Task 11) replaces `REASONS[...]` everywhere in `PendingQueue`.

**Ordering note:** Tasks 6 → 9 → 10 leave `tsc` red in between (route files mid-migration) and 8 references the `'reversed'` reason added in 9. Execute 6, 9, 10 as a block and run `next build` only after 10; do 8 after 9. All other tasks are independently green.

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-08-30-buyin-credit-ledger.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**
