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
