# Catch-up Schedules and Bill Reconciliation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a roommate pick a schedule on a catch-up link like on a monthly one, and make a corrected bill keep paid payments paid, moving the difference onto the payments still to come.

**Architecture:** Both changes live in `packages/core` payload building. Catch-ups gain `catchupPlans` (owner's installments + household cadences clipped to the catch-up window). A new `reconcile.ts` re-cuts each plan against the rows last published — stored locally on `Published.plans`, backfilled from `/api/share/status` for links published before this change. One migration keeps a catch-up-only pick from overwriting the link's monthly preference.

**Tech Stack:** TypeScript, zod 4, Vitest, Next.js 16 App Router, PGlite/Postgres (`rp` schema), Playwright.

**Spec:** `docs/superpowers/specs/2026-09-21-catchup-plans-and-reconcile-design.md`

## Global Constraints

- Payload limits (`sharePayloadSchema`): ≤ 12 plans, ≤ 24 payments per plan, ≥ 1 payment per plan.
- The owner's catch-up plan keeps key `CATCHUP_PLAN_KEY` (`"catchup"`) and stays `defaultPlan`.
- Money is integer cents; even splits use `splitEven` (odd cents to the earliest rows).
- A published statement whose numbers haven't changed must hash identically — marking a payment received must never make a statement read "changed since you published".
- Migrations: new file only, idempotent (`create or replace`), never run against remote; README lists it.
- House style: ~110-col lines like neighbouring files (don't run prettier's 80-col config over existing code); JSX text apostrophes as `&apos;`.
- Commit after each task on `feat/catchup-plans-and-reconcile`; no push. Commit messages end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

## File Map

| file | change |
| --- | --- |
| `packages/core/src/schema.ts` | `publishedPlanSchema`, `publishedSchema.plans`, `PublishedPlan` type |
| `packages/core/src/reconcile.ts` (new) | `reconcilePlan`, `reconcilePlans` |
| `packages/core/src/catchup.ts` | `catchupPlans` |
| `packages/core/src/share.ts` | `publishedPlans`; both builders reconcile; catch-up builder takes `cadences` |
| `packages/core/src/index.ts` | export `reconcile` |
| `supabase/migrations/20260921000000_rp_pick_preference.sql` (new) | `rp.pick` preference rule |
| `apps/app/app/api/share/status/route.ts` | statements carry `plans` |
| `apps/app/components/month/share-card.tsx` | store plans on publish; backfill from status |
| `apps/app/components/month/month-tab.tsx` | plan preview shows payload plans |
| `apps/app/components/catchup/catchup-tab.tsx` | pass cadences; preview shows reconciled owner plan; copy |
| tests | `reconcile.test.ts`, `catchup-plans.test.ts` (new); `share.test.ts`, `persistence.test.ts`, `load.test.ts`, `rp-sql.test.ts`, `routes.test.ts`, `e2e/smoke.spec.ts` |
| `README.md` | migration step; catch-up schedules; corrected bills |

---

### Task 1: Remember the published schedules

**Files:**
- Modify: `packages/core/src/schema.ts:142` (publishedSchema) and the type exports (~line 225)
- Test: `packages/core/src/persistence.test.ts`, `packages/core/src/load.test.ts`

**Interfaces:**
- Produces: `publishedPlanSchema`; `type PublishedPlan = { key: string; payments: { date: string; amountCents: number }[] }`; `Published.plans?: PublishedPlan[]`

- [ ] **Step 1: Write the failing tests**

In `persistence.test.ts` `richData()`, replace the monthly `setPublished` call with:

```ts
  M.setPublished(data, { kind: "monthly", monthId }, biscuit, {
    at: now.toISOString(),
    hash: "abc123",
    plans: [{ key: "half", payments: [{ date: "2026-09-01", amountCents: 25000 }, { date: "2026-09-15", amountCents: 26000 }] }],
  })
```

and in "keeps what's been paid, published and shared" replace the `published` assertion with:

```ts
    expect(september.published[person]).toMatchObject({
      hash: "abc123",
      plans: [{ key: "half", payments: [{ date: "2026-09-01", amountCents: 25000 }, { date: "2026-09-15", amountCents: 26000 }] }],
    })
```

In `load.test.ts`, after "remembers a dismissed tip nudge…":

```ts
  it("drops a damaged copy of a published schedule without losing its month", () => {
    const raw = stored(saved())
    const person = raw.people[0].id
    raw.months[0].published[person] = {
      at: "2026-09-19T00:00:00.000Z",
      hash: "abc",
      plans: [{ key: "", payments: "lots" }],
    }

    const result = parseAppData(raw, now)
    expect(result.fresh).toBe(false)
    expect(result.data.months).toHaveLength(2)
    expect(result.data.months[0]!.published[person]).toEqual({ at: "2026-09-19T00:00:00.000Z", hash: "abc" })
  })
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @workspace/core exec vitest run src/persistence.test.ts src/load.test.ts`
Expected: FAIL — `plans` stripped on round-trip; the damaged month is dropped or its `published` rejected.

- [ ] **Step 3: Implement**

In `schema.ts`, replace `publishedSchema`:

```ts
/** One plan's schedule as it was last published — what the roommate was paying against. */
export const publishedPlanSchema = z.object({
  key: z.string().min(1).max(64),
  payments: z.array(z.object({ date: isoDateSchema, amountCents: cents })).min(1).max(24),
})

export const publishedSchema = z.object({
  at: timestamp,
  hash: z.string().max(64),
  // A copy of what was published, kept so a corrected bill can leave paid payments alone. It's a
  // cache — the server has the original — so a damaged one is dropped, never its whole month.
  plans: z.array(publishedPlanSchema).max(12).optional().catch(undefined),
})
```

and beside `export type Published`:

```ts
export type PublishedPlan = z.infer<typeof publishedPlanSchema>
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --filter @workspace/core exec vitest run && pnpm --filter @workspace/core typecheck`
Expected: all pass, no type errors.

- [ ] **Step 5: Commit** — `feat(core): remember the schedules as they were published`

---

### Task 2: Reconcile a plan against what's been paid

**Files:**
- Create: `packages/core/src/reconcile.ts`, `packages/core/src/reconcile.test.ts`
- Modify: `packages/core/src/index.ts` (add `export * from "./reconcile"`)

**Interfaces:**
- Consumes: `PublishedPlan` (Task 1), `Plan`/`scheduleEvenly` from `plans.ts`, `splitEven` from `money.ts`
- Produces: `reconcilePlan(plan: Plan, published: PublishedPlan | undefined, receivedCents: Cents): Plan`; `reconcilePlans(plans: Plan[], published: PublishedPlan[] | undefined, receivedCents: Cents): Plan[]`

- [ ] **Step 1: Write the failing tests** — `reconcile.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { type Plan, scheduleEvenly } from "./plans"
import { reconcilePlan, reconcilePlans } from "./reconcile"
import type { PublishedPlan } from "./schema"

const TWICE = ["2026-09-01", "2026-09-15"]
const WEEKLY = ["2026-09-01", "2026-09-08", "2026-09-15", "2026-09-22"]
const plan = (total: number, dates = TWICE, key = "half"): Plan => ({
  key,
  name: key,
  payments: scheduleEvenly(total, dates),
})
const published = (p: Plan): PublishedPlan => ({
  key: p.key,
  payments: p.payments.map(({ date, amountCents }) => ({ date, amountCents })),
})
const amounts = (p: Plan) => p.payments.map((x) => x.amountCents)

describe("reconcilePlan", () => {
  it("keeps a paid payment when the bill goes up, and puts the difference on the next", () => {
    expect(amounts(reconcilePlan(plan(110000), published(plan(100000)), 50000))).toEqual([50000, 60000])
  })

  it("keeps a paid payment when the bill goes down", () => {
    expect(amounts(reconcilePlan(plan(90000), published(plan(100000)), 50000))).toEqual([50000, 40000])
  })

  it("puts an increase on the last payment once everything's been paid", () => {
    expect(amounts(reconcilePlan(plan(110000), published(plan(100000)), 100000))).toEqual([50000, 60000])
  })

  it("re-cuts a payment that was only part-paid", () => {
    expect(amounts(reconcilePlan(plan(110000), published(plan(100000)), 20000))).toEqual([55000, 55000])
  })

  it("lets paid payments give way when the bill drops below what's been paid", () => {
    expect(amounts(reconcilePlan(plan(40000), published(plan(100000)), 50000))).toEqual([20000, 20000])
  })

  it("has nothing to keep on a single payment", () => {
    const one = (total: number) => plan(total, ["2026-09-01"], "full")
    expect(amounts(reconcilePlan(one(110000), published(one(100000)), 100000))).toEqual([110000])
  })

  it("re-spreads everything when the dates have changed", () => {
    const moved = plan(100000, ["2026-09-03", "2026-09-17"])
    expect(reconcilePlan(plan(110000), published(moved), 50000)).toEqual(plan(110000))
  })

  it("keeps several paid payments, and spreads the rest evenly", () => {
    const next = reconcilePlan(plan(110000, WEEKLY), published(plan(100000, WEEKLY)), 50000)
    expect(amounts(next)).toEqual([25000, 25000, 30000, 30000])
    expect(next.payments.map((p) => p.date)).toEqual(WEEKLY)
    expect(next.payments.map((p) => p.label)).toEqual(plan(110000, WEEKLY).payments.map((p) => p.label))
  })

  it("changes nothing when nothing's been received, or nothing was published", () => {
    expect(reconcilePlan(plan(110000), published(plan(100000)), 0)).toEqual(plan(110000))
    expect(reconcilePlan(plan(110000), undefined, 50000)).toEqual(plan(110000))
  })

  it("changes nothing, to the cent, when the total hasn't changed", () => {
    for (const total of [100000, 100001, 100002, 100003, 95501]) {
      for (const received of [0, 1, 25000, 25001, 50000, 75001, 100003]) {
        const even = plan(total, WEEKLY)
        expect(reconcilePlan(even, published(even), received)).toEqual(even)
      }
    }
  })

  it("holds up through a second correction on top of the first", () => {
    const first = reconcilePlan(plan(110000), published(plan(100000)), 50000)
    expect(amounts(reconcilePlan(plan(120000), published(first), 50000))).toEqual([50000, 70000])
  })
})

describe("reconcilePlans", () => {
  it("matches each plan to its own published schedule by key", () => {
    const now = [plan(110000, ["2026-09-01"], "full"), plan(110000, TWICE, "half")]
    const before = [published(plan(100000, ["2026-09-01"], "full")), published(plan(100000, TWICE, "half"))]
    expect(reconcilePlans(now, before, 50000).map(amounts)).toEqual([[110000], [50000, 60000]])
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @workspace/core exec vitest run src/reconcile.test.ts`
Expected: FAIL — cannot resolve `./reconcile`.

- [ ] **Step 3: Implement** — `reconcile.ts`:

```ts
import { type Cents, splitEven } from "./money"
import type { Plan } from "./plans"
import type { PublishedPlan } from "./schema"

/**
 * A schedule re-cut for a new total without rewriting what's been paid.
 *
 * `plan` is the schedule as the current numbers build it; `published` is the same plan as the
 * roommate last saw it. What's been received is poured into the published rows oldest-first, and
 * every row it fully covered keeps its published amount. Whatever is still owed is spread evenly
 * over the rest — so when a bill is corrected after they've started paying, the payments they've
 * made stay made and the difference lands on the ones still to come.
 *
 * A row only stays settled while its date is unchanged (a new schedule re-spreads everything),
 * while it isn't the last row (the last absorbs a change, since there's nothing later to put it
 * on), and while the settled rows still fit inside the new total (a bill that drops below what's
 * been paid gives way, and shows as overpaid).
 */
export function reconcilePlan(plan: Plan, published: PublishedPlan | undefined, receivedCents: Cents): Plan {
  if (!published || receivedCents <= 0) return plan
  const total = plan.payments.reduce((sum, p) => sum + p.amountCents, 0)
  const limit = Math.min(published.payments.length, plan.payments.length - 1)

  const settled: Cents[] = []
  let pool = receivedCents
  let settledCents = 0
  for (let i = 0; i < limit; i++) {
    const row = published.payments[i]!
    if (row.date !== plan.payments[i]!.date) break
    if (row.amountCents <= 0 || row.amountCents > pool) break
    if (settledCents + row.amountCents > total) break
    settled.push(row.amountCents)
    pool -= row.amountCents
    settledCents += row.amountCents
  }
  if (settled.length === 0) return plan

  const rest = splitEven(total - settledCents, plan.payments.length - settled.length)
  return {
    ...plan,
    payments: plan.payments.map((payment, i) => ({
      ...payment,
      amountCents: i < settled.length ? settled[i]! : rest[i - settled.length]!,
    })),
  }
}

/** Every plan reconciled against the published plan with the same key. */
export function reconcilePlans(
  plans: Plan[],
  published: PublishedPlan[] | undefined,
  receivedCents: Cents
): Plan[] {
  return plans.map((plan) => reconcilePlan(plan, published?.find((p) => p.key === plan.key), receivedCents))
}
```

Add `export * from "./reconcile"` to `index.ts` (alphabetical, after `./plans`).

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @workspace/core exec vitest run src/reconcile.test.ts` → PASS.

- [ ] **Step 5: Commit** — `feat(core): reconcile a schedule so paid payments stay paid`

---

### Task 3: Monthly payloads reconcile

**Files:**
- Modify: `packages/core/src/share.ts` (imports; `publishedPlans`; `buildMonthlyPayload` plans)
- Test: `packages/core/src/share.test.ts`

**Interfaces:**
- Consumes: `reconcilePlans` (Task 2), `paidTotal` from `paid.ts`
- Produces: `publishedPlans(payload: SharePayload): PublishedPlan[]`

- [ ] **Step 1: Write the failing test** — in `share.test.ts` `describe("buildMonthlyPayload")` (import `publishedPlans`):

```ts
  it("keeps what they've paid when a bill is corrected after publishing", () => {
    const before = buildMonthlyPayload({ month, personId: "a", cadences: defaultCadences(), currency: "USD" })
    const paid = before.plans.find((p) => p.key === "half")!.payments[0]!.amountCents
    const corrected: MonthRecord = {
      ...month,
      lines: month.lines.map((l) => (l.id === "1" ? { ...l, amountCents: 160000 } : l)),
      published: { a: { at: "2026-10-02T00:00:00.000Z", hash: payloadHash(before), plans: publishedPlans(before) } },
      paid: { a: [{ id: "p1", amountCents: paid, date: "2026-10-01" }] },
    }

    const after = buildMonthlyPayload({ month: corrected, personId: "a", cadences: defaultCadences(), currency: "USD" })
    const half = after.plans.find((p) => p.key === "half")!
    expect(after.shareCents).toBe(before.shareCents + 5000)
    expect(half.payments[0]!.amountCents).toBe(paid)
    expect(half.payments.reduce((sum, p) => sum + p.amountCents, 0)).toBe(after.shareCents)
  })

  it("publishes exactly what it would have when nothing's changed", () => {
    const before = buildMonthlyPayload({ month, personId: "a", cadences: defaultCadences(), currency: "USD" })
    const half = before.plans.find((p) => p.key === "half")!
    const same: MonthRecord = {
      ...month,
      published: { a: { at: "2026-10-02T00:00:00.000Z", hash: payloadHash(before), plans: publishedPlans(before) } },
      paid: { a: [{ id: "p1", amountCents: half.payments[0]!.amountCents, date: "2026-10-01" }] },
    }
    const again = buildMonthlyPayload({ month: same, personId: "a", cadences: defaultCadences(), currency: "USD" })
    expect(payloadHash(again)).toBe(payloadHash(before))
  })
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter @workspace/core exec vitest run src/share.test.ts` → FAIL (`publishedPlans` not exported; first payment re-cut).

- [ ] **Step 3: Implement** — in `share.ts`:

```ts
import { paidTotal } from "./paid"
import { reconcilePlans } from "./reconcile"
```

add `type PublishedPlan` to the `./schema` import, and replace in `buildMonthlyPayload`:

```ts
  const shareCents = computed.totals[personId] ?? 0
  // Once they've started paying, a corrected bill only moves what they haven't paid yet.
  const plans = reconcilePlans(
    buildPlans(shareCents, cadences, month.period),
    month.published[personId]?.plans,
    paidTotal(month.paid[personId] ?? [])
  )
```

Add after `payloadHash`:

```ts
/** A payload's schedules, as the owner's device keeps them to reconcile against later. */
export function publishedPlans(payload: SharePayload): PublishedPlan[] {
  return payload.plans.map((plan) => ({
    key: plan.key,
    payments: plan.payments.map(({ date, amountCents }) => ({ date, amountCents })),
  }))
}
```

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter @workspace/core exec vitest run` → PASS.

- [ ] **Step 5: Commit** — `feat(core): a corrected bill leaves paid monthly payments alone`

---

### Task 4: Catch-up schedules, reconciled

**Files:**
- Modify: `packages/core/src/catchup.ts` (new `catchupPlans` + helpers), `packages/core/src/share.ts` (`buildCatchupPayload`)
- Create: `packages/core/src/catchup-plans.test.ts`
- Modify test: `packages/core/src/share.test.ts` (`describe("buildCatchupPayload")`)

**Interfaces:**
- Consumes: `reconcilePlans`, `publishedPlans`, `paidTotal`
- Produces: `catchupPlans(args: { result: CatchupResult; record: CatchupRecord; cadences: Cadence[] }): Plan[]`; `buildCatchupPayload(args: { result; record; cadences: Cadence[]; currency })`

- [ ] **Step 1: Write the failing tests** — `catchup-plans.test.ts`:

```ts
import { describe, expect, it } from "vitest"
import { CATCHUP_PLAN_KEY, catchupPlans, computeCatchup } from "./catchup"
import { defaultCadences } from "./defaults"
import type { Plan } from "./plans"
import type { Cadence, CatchupRecord, ItemTemplate } from "./schema"

const record: CatchupRecord = {
  personId: "a",
  moveIn: "2026-09-14",
  estimates: {},
  includeNextMonth: true,
  installments: 4,
  start: "2026-09-14",
  end: "2026-10-01",
  paid: [],
}
const items: ItemTemplate[] = [
  { id: "rent", label: "Rent", kind: "fixed", enabled: true, defaultAmountCents: 191000, split: { mode: "default" } },
]
const catchup = (r: CatchupRecord) =>
  computeCatchup({ record: r, items, split: { mode: "even" }, people: [{ id: "a", nickname: "A" }] })
const cadence = (key: string, days: number[]): Cadence => ({ id: key, key, name: key, days })
const plansFor = (r: CatchupRecord, cadences: Cadence[]) => catchupPlans({ result: catchup(r), record: r, cadences })
const datesOf = (plans: Plan[]) => Object.fromEntries(plans.map((p) => [p.key, p.payments.map((x) => x.date)]))

describe("catchupPlans", () => {
  it("offers the owner's installments first, then the household's usual schedules", () => {
    const plans = plansFor(record, defaultCadences())
    expect(plans.map((p) => p.key)).toEqual([CATCHUP_PLAN_KEY, "full", "half", "weekly"])
    expect(plans[0]!.payments).toEqual(catchup(record).plan.payments)
    expect(datesOf(plans.slice(1))).toEqual({
      full: ["2026-10-01"],
      half: ["2026-09-15", "2026-10-01"],
      weekly: ["2026-09-15", "2026-09-22", "2026-10-01"],
    })
  })

  it("spreads the whole catch-up evenly over each schedule's dates", () => {
    const plans = plansFor(record, defaultCadences())
    for (const plan of plans) {
      expect(plan.payments.reduce((sum, p) => sum + p.amountCents, 0)).toBe(149617)
    }
    expect(plans.find((p) => p.key === "half")!.payments.map((p) => p.amountCents)).toEqual([74809, 74808])
  })

  it("clamps a day past the end of a short month, like monthly dates do", () => {
    const r = { ...record, moveIn: "2026-02-10", start: "2026-02-10", end: "2026-03-31" }
    expect(datesOf(plansFor(r, [cadence("end", [31])]))).toMatchObject({ end: ["2026-02-28", "2026-03-31"] })
  })

  it("leaves out a schedule with no day before the catch-up is due", () => {
    const r = { ...record, end: "2026-09-30" }
    expect(plansFor(r, defaultCadences()).map((p) => p.key)).toEqual([CATCHUP_PLAN_KEY, "half", "weekly"])
  })

  it("offers two schedules that land on the same dates only once", () => {
    const plans = plansFor(record, [cadence("first", [1]), cadence("first-or-second", [1, 2])])
    expect(plans.map((p) => p.key)).toEqual([CATCHUP_PLAN_KEY, "first"])
  })

  it("never offers more schedules than a share link holds", () => {
    const many = Array.from({ length: 12 }, (_, i) => cadence(`c${i}`, [14 + i]))
    const plans = plansFor(record, many)
    expect(plans).toHaveLength(12)
    expect(plans[0]!.key).toBe(CATCHUP_PLAN_KEY)
  })

  it("describes the owner's schedule by its dates, and the household's by their days", () => {
    const plans = plansFor(record, defaultCadences())
    expect(plans[0]!.description).toBe("Evenly spaced from Sep 14 to Oct 1.")
    expect(plans.find((p) => p.key === "half")!.description).toBe("On the 1st and 15th, like every month.")
  })
})
```

Rework `share.test.ts` `describe("buildCatchupPayload")` — hoist `record`/`result` to the describe, pass `cadences: defaultCadences()`, and replace `expect(p.plans).toHaveLength(1)` with:

```ts
    // The owner's installments first and by default, then the household's usual schedules.
    expect(p.plans.map((plan) => plan.key)).toEqual(["catchup", "full", "half", "weekly"])
```

and add:

```ts
  it("keeps what they've paid when the real bills replace the estimates", () => {
    const before = buildCatchupPayload({ result, record, cadences: defaultCadences(), currency: "USD" })
    const first = before.plans[0]!.payments[0]!.amountCents
    const paying = {
      ...record,
      paid: [{ id: "p1", amountCents: first, date: "2026-09-14" }],
      published: { at: "2026-09-14T00:00:00.000Z", hash: payloadHash(before), plans: publishedPlans(before) },
    }
    const higher = computeCatchup({
      record: paying,
      items: [{ ...rent, defaultAmountCents: 200000 }],
      split: { mode: "even" },
      people: [{ id: "a", nickname: "A" }],
    })

    const after = buildCatchupPayload({ result: higher, record: paying, cadences: defaultCadences(), currency: "USD" })
    expect(after.shareCents).toBeGreaterThan(before.shareCents)
    expect(after.plans[0]!.payments[0]!.amountCents).toBe(first)
    expect(after.plans[0]!.payments.reduce((sum, p) => sum + p.amountCents, 0)).toBe(after.shareCents)
  })
```

(`rent` = the `ItemTemplate` literal the existing test passes, hoisted to a const.)

- [ ] **Step 2: Run to verify they fail** — `pnpm --filter @workspace/core exec vitest run src/catchup-plans.test.ts src/share.test.ts` → FAIL (`catchupPlans` missing; one plan shipped).

- [ ] **Step 3: Implement** — in `catchup.ts` add `dateInPeriod, formatShortDate, ordinal` to the `./dates` import and `Cadence` to the `./schema` type import, then after `computeCatchup`:

```ts
/** Every date from `start` to `end` inclusive that falls on one of `days`, clamped like monthly dates. */
function datesOnDays(days: number[], start: ISODate, end: ISODate): ISODate[] {
  const dates = new Set<ISODate>()
  for (let period = periodOf(start); period <= periodOf(end); period = nextPeriod(period)) {
    for (const day of days) {
      const date = dateInPeriod(period, day)
      if (date >= start && date <= end) dates.add(date)
    }
  }
  return [...dates].sort()
}

function describeDays(days: number[]): string {
  const list = [...new Set(days)].sort((a, b) => a - b).map(ordinal)
  const joined = list.length === 1 ? list[0]! : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`
  return `On the ${joined}, like every month.`
}

/**
 * The schedules a roommate can pick from for their catch-up: the owner's installments first — the
 * default — then each of the household's usual schedules, on whichever of its days fall between the
 * first payment and the caught-up-by date. They keep the monthly plans' keys and names, so a pick
 * here carries on into the months after. A schedule with no day in that window isn't offered, and
 * one landing on exactly the same dates as an earlier one is left out.
 */
export function catchupPlans(args: {
  result: CatchupResult
  record: CatchupRecord
  cadences: Cadence[]
}): Plan[] {
  const { result, record, cadences } = args
  const owner: Plan = {
    ...result.plan,
    description: `Evenly spaced from ${formatShortDate(record.start)} to ${formatShortDate(record.end)}.`,
  }
  const plans = [owner]
  const seen = new Set([owner.payments.map((p) => p.date).join()])
  for (const cadence of cadences) {
    const dates = datesOnDays(cadence.days, record.start, record.end)
    const id = dates.join()
    if (dates.length === 0 || seen.has(id)) continue
    seen.add(id)
    plans.push({
      key: cadence.key,
      name: cadence.name,
      description: describeDays(cadence.days),
      payments: scheduleEvenly(result.combinedCents, dates),
    })
  }
  // As many as a share link holds.
  return plans.slice(0, 12)
}
```

In `share.ts`: change `import type { CatchupResult } from "./catchup"` to `import { type CatchupResult, catchupPlans } from "./catchup"`, and `buildCatchupPayload` to take `cadences: Cadence[]` and ship:

```ts
    // Picked like a month's: the owner's installments or one of the household's usual schedules.
    plans: reconcilePlans(catchupPlans({ result, record, cadences }), record.published?.plans, paidTotal(record.paid)),
    defaultPlan: result.plan.key,
```

- [ ] **Step 4: Run to verify they pass** — `pnpm --filter @workspace/core exec vitest run && pnpm --filter @workspace/core typecheck` → PASS. (The app's `catchup-tab.tsx` call site fails typecheck until Task 7 — expected.)

- [ ] **Step 5: Commit** — `feat(core): catch-ups offer the household's schedules, and keep what's been paid`

---

### Task 5: A catch-up pick only becomes the preference when months have it

**Files:**
- Create: `supabase/migrations/20260921000000_rp_pick_preference.sql`
- Test: `apps/app/tests/rp-sql.test.ts` (`describe("rp.view / rp.pick")`)

- [ ] **Step 1: Write the failing test**

```ts
  it("carries a catch-up pick into later months only when months can have that plan", async () => {
    await pub({ p_kind: "catchup", p_payload: payload(["catchup", "weekly"]) })
    const pick = (plan: string) =>
      rp.call("pick", { p_token_hash: h(1), p_period: THIS, p_kind: "catchup", p_plan: plan })
    const preferred = async () => {
      const v = await rp.call<ViewResult>("view", { p_token_hash: h(1) })
      if (!v.ok) throw new Error("expected ok")
      return v.link.preferred_plan
    }

    expect(await pick("weekly")).toMatchObject({ ok: true, chosen_plan: "weekly" })
    expect(await preferred()).toBe("weekly")
    // The owner's own installments exist on no month, so picking them leaves the preference alone.
    expect(await pick("catchup")).toMatchObject({ ok: true, chosen_plan: "catchup" })
    expect(await preferred()).toBe("weekly")
  })
```

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter app exec vitest run tests/rp-sql.test.ts` → FAIL (preferred becomes `"catchup"`).

- [ ] **Step 3: Implement** — the migration: header comment (why; "Apply after 20260919000000_rp_received.sql. Safe to run more than once."), then `create or replace function rp.pick(...)` copied verbatim from `20260918000000_rp_schema.sql:362-416` with the final link update wrapped:

```sql
  -- A pick becomes the link's default for later months only if months can have that plan: the
  -- catch-up's own installments ('catchup') exist on no month.
  if p_kind = 'monthly' or p_plan <> 'catchup' then
    update rp.links l
    set preferred_plan = p_plan, updated_at = now()
    where l.id = v_stmt.link_id and l.preferred_plan is distinct from p_plan;
  end if;
```

then:

```sql
revoke execute on function rp.pick(text, text, text, text) from public, anon, authenticated;
grant execute on function rp.pick(text, text, text, text) to anon, authenticated, service_role;
```

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter app exec vitest run tests/rp-sql.test.ts` → PASS (incl. "the migration can be applied twice").

- [ ] **Step 5: Commit** — `feat(rp): a catch-up's own plan doesn't overwrite the monthly preference`

---

### Task 6: The status route shares the published schedules

**Files:**
- Modify: `apps/app/app/api/share/status/route.ts`
- Test: `apps/app/tests/routes.test.ts` ("reports status per token")

- [ ] **Step 1: Write the failing test** — in "reports status per token", after the `toMatchObject`:

```ts
    // The schedules as published, so the owner's device can reconcile against them.
    const [statement] = body.links[token].statements
    expect(statement.plans.map((p: { key: string }) => p.key)).toEqual(["full", "half", "weekly"])
    expect(statement.plans[0]).toEqual({ key: "full", payments: [{ date: expect.any(String), amountCents: 95500 }] })
```

(Adjust `95500` to whatever the "publishes, then revises" test last published, read before writing.)

- [ ] **Step 2: Run to verify it fails** — `pnpm --filter app exec vitest run tests/routes.test.ts` → FAIL (`plans` undefined).

- [ ] **Step 3: Implement** — `import { type PublishedPlan, publishedPlans } from "@workspace/core"`; add to the statement type:

```ts
        /** The schedules as published — the owner's device reconciles a corrected bill against them. */
        plans: PublishedPlan[]
```

and `plans: publishedPlans(s.payload),` in the mapping.

- [ ] **Step 4: Run to verify it passes** — `pnpm --filter app exec vitest run tests/routes.test.ts` → PASS.

- [ ] **Step 5: Commit** — `feat(api): link status carries the published schedules`

---

### Task 7: Wire the app

**Files:**
- Modify: `apps/app/components/month/share-card.tsx`, `apps/app/components/month/month-tab.tsx`, `apps/app/components/catchup/catchup-tab.tsx`

- [ ] **Step 1: ShareCard** — import `publishedPlans`; in `publish()`:

```ts
    actions.setPublished(statement, personId, {
      at: new Date().toISOString(),
      hash: payloadHash(payload),
      plans: publishedPlans(payload),
    })
```

and after `remote` is computed:

```ts
  // Links published before this device kept a copy of the schedules: take the server's copy, once,
  // so a bill corrected after they've started paying still leaves their paid payments alone.
  const remotePlans = remote?.plans
  React.useEffect(() => {
    if (!published || published.plans || !remotePlans) return
    actions.setPublished(statement, personId, { ...published, plans: remotePlans })
  }, [published, remotePlans, statement, personId])
```

- [ ] **Step 2: Month tab** — `<PlanCards plans={payload?.plans ?? plans} shareCents={shareCents} />` (the preview shows what the roommate will get, reconciled).

- [ ] **Step 3: Catch-up tab** — `buildCatchupPayload({ result, record, cadences: data.cadences, currency: data.household.currency })`; `const ownerPlan = payload?.plans.find((p) => p.key === result.plan.key) ?? result.plan` and map `ownerPlan.payments` in the preview table; copy:
  - aside: `{who} settles {months.length > 1 ? "both months" : "it"} in one catch-up, on whichever schedule they pick, so they&apos;re never asked for the same month twice. Their share still shows in each month&apos;s ledger.`
  - "Smoothed catch-up plan" description: `` `Equal installments, evenly spaced between the two dates. ${who} sees this first, and can pick one of your usual schedules instead.` ``

- [ ] **Step 4: Verify** — `pnpm typecheck && pnpm lint && pnpm test` → all green, no warnings.

- [ ] **Step 5: Commit** — `feat(app): keep published schedules, and offer catch-up choices`

---

### Task 8: End to end

**Files:** Modify `e2e/smoke.spec.ts`

- [ ] **Step 1: Extend the monthly flow** — after `await expect(page.getByText(/up to date/)).toBeVisible()` in "owner publishes, roommate picks…":

```ts
  // The correction keeps the payment already made; the extra dollar goes on what's still to come.
  await expect(page.getByText("$238.75 of $956.00 received")).toBeVisible()
  await expect(page.getByRole("button", { name: "Mark paid" })).toHaveCount(3)
  await expect
    .poll(async () => (await roommate.request.get(`/r/${token}/calendar.ics?tz=America/Chicago`)).text())
    .toContain("SUMMARY:Paid · $238.75 · Unit 3012")
```

and after the roommate's `$956.00` assertion:

```ts
  const weekly = roommate.getByRole("radio", { name: /Weekly/ })
  await expect(weekly).toContainText("Paid")
  await expect(weekly).toContainText("$239.09")
```

- [ ] **Step 2: Extend the catch-up flow** — after `await expect(roommate.getByText("Move-in catch-up")).toBeVisible()`:

```ts
  // They pick how to pay it off: the owner's installments, or one of the household's usual schedules.
  await expect(roommate.getByRole("radio")).toHaveCount(4)
  await roommate.getByRole("radio", { name: /Split in two/ }).click()
  await expect(roommate.getByTestId("pick-feedback")).toContainText("Split in two")
  await page.reload()
  await expect(page.getByTestId("pick-status")).toHaveText("Biscuit picked Split in two.")
```

- [ ] **Step 3: Run** — `pnpm e2e` → all pass (2 pre-existing phone skips).

- [ ] **Step 4: Commit** — `test(e2e): corrected bills keep paid payments; catch-up schedules can be picked`

---

### Task 9: Document and verify

**Files:** Modify `README.md`

- [ ] **Step 1:** Database setup: add `20260921000000_rp_pick_preference.sql` as step 3 (renumber the rest). "Catch-ups, credits and splits": a paragraph on catch-up schedules. "Sharing and calendars": a "When a bill is corrected" subsection stating the rule, the last-row case, the part-payment case, and where the published copy lives (plus the server backfill).
- [ ] **Step 2:** `pnpm typecheck && pnpm lint && pnpm test && pnpm build && pnpm e2e` — all green.
- [ ] **Step 3: Commit** — `docs: catch-up schedules, corrected bills, and the pick-preference migration`
