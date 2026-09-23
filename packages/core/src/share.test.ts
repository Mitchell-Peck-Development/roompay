import { describe, expect, it } from "vitest"
import { computeCatchup } from "./catchup"
import { defaultCadences } from "./defaults"
import type { CatchupRecord, ItemTemplate, MonthRecord } from "./schema"
import {
  buildCatchupPayload,
  buildMonthlyPayload,
  lastDueOn,
  payloadHash,
  pickPlan,
  publishedPlans,
  sharePayloadSchema,
} from "./share"

const month: MonthRecord = {
  id: "m",
  period: "2026-10",
  title: "October 2026",
  split: { mode: "even" },
  participants: [
    { personId: "a", nickname: "A" },
    { personId: "b", nickname: "B" },
  ],
  paid: {},
  published: {},
  createdAt: "2026-09-18T00:00:00.000Z",
  updatedAt: "2026-09-18T00:00:00.000Z",
  lines: [
    { id: "1", label: "Rent", kind: "fixed", amountCents: 150000, split: { mode: "default" } },
    { id: "2", label: "Water", kind: "variable", amountCents: null, split: { mode: "default" } },
    { id: "3", label: "B's parking", kind: "fixed", amountCents: 5000, split: { mode: "percent", pct: { b: 100 } } },
    {
      id: "4",
      label: "Gas",
      kind: "metered",
      amountCents: null,
      split: { mode: "default" },
      meter: { unit: "therm", rate: "1", baseFeeCents: 0, input: "usage", usage: "30" },
    },
  ],
}

describe("buildMonthlyPayload", () => {
  const p = buildMonthlyPayload({ month, personId: "a", cadences: defaultCadences(), currency: "USD" })

  it("carries only this roommate's lines and totals", () => {
    expect(p.lines).toEqual([
      { label: "Rent", totalCents: 150000, shareCents: 50000 },
      { label: "Gas", totalCents: 3000, shareCents: 1000, detail: "30 therm × $1" },
    ])
    expect([p.totalCents, p.shareCents, p.kind, p.period, p.defaultPlan]).toEqual([
      153000, 51000, "monthly", "2026-10", "full",
    ])
    expect(p.plans.map((x) => x.key)).toEqual(["full", "half", "weekly"])
    expect(sharePayloadSchema.safeParse(p).success).toBe(true)
  })

  it("respects a chosen default plan", () => {
    const q = buildMonthlyPayload({ month, personId: "a", cadences: defaultCadences(), currency: "USD", defaultPlanKey: "weekly" })
    expect(q.defaultPlan).toBe("weekly")
    const r = buildMonthlyPayload({ month, personId: "a", cadences: defaultCadences(), currency: "USD", defaultPlanKey: "gone" })
    expect(r.defaultPlan).toBe("full")
  })

  it("hash is stable and sensitive", () => {
    expect(payloadHash(JSON.parse(JSON.stringify(p)))).toBe(payloadHash(p))
    const reordered = Object.fromEntries(Object.entries(p).reverse()) as typeof p
    expect(payloadHash(reordered)).toBe(payloadHash(p))
    expect(payloadHash({ ...p, shareCents: 1 })).not.toBe(payloadHash(p))
  })

  it("helpers", () => {
    expect(lastDueOn(p)).toBe("2026-10-22")
    expect(pickPlan(p, null, "nope", "weekly").key).toBe("weekly")
    expect(pickPlan(p, "nope").key).toBe("full")
  })

  it("rejects payloads without plans or with junk", () => {
    expect(sharePayloadSchema.safeParse({ ...p, plans: [] }).success).toBe(false)
    expect(sharePayloadSchema.safeParse({ ...p, defaultPlan: "missing" }).success).toBe(false)
    expect(sharePayloadSchema.safeParse({ ...p, shareCents: 1.5 }).success).toBe(false)
  })

  // What the owner last published, and a first payment received against it.
  const publishedAfterPaying = (paidCents: number): Pick<MonthRecord, "published" | "paid"> => ({
    published: { a: { at: "2026-10-02T00:00:00.000Z", hash: payloadHash(p), plans: publishedPlans(p) } },
    paid: { a: [{ id: "p1", amountCents: paidCents, date: "2026-10-01" }] },
  })
  const firstOfHalf = p.plans.find((x) => x.key === "half")!.payments[0]!.amountCents

  it("keeps what they've paid when a bill is corrected after publishing", () => {
    const corrected: MonthRecord = {
      ...month,
      ...publishedAfterPaying(firstOfHalf),
      lines: month.lines.map((l) => (l.id === "1" ? { ...l, amountCents: 160000 } : l)),
    }
    const after = buildMonthlyPayload({ month: corrected, personId: "a", cadences: defaultCadences(), currency: "USD" })
    const half = after.plans.find((x) => x.key === "half")!

    expect(after.shareCents).toBeGreaterThan(p.shareCents)
    expect(half.payments[0]!.amountCents).toBe(firstOfHalf)
    expect(half.payments.reduce((sum, x) => sum + x.amountCents, 0)).toBe(after.shareCents)
  })

  it("publishes exactly the same statement when only a payment has come in", () => {
    const paying: MonthRecord = { ...month, ...publishedAfterPaying(firstOfHalf) }
    const again = buildMonthlyPayload({ month: paying, personId: "a", cadences: defaultCadences(), currency: "USD" })
    expect(payloadHash(again)).toBe(payloadHash(p))
  })
})

describe("buildCatchupPayload", () => {
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
  const rent: ItemTemplate = {
    id: "rent",
    label: "Rent",
    kind: "fixed",
    enabled: true,
    defaultAmountCents: 191000,
    split: { mode: "default" },
  }
  const people = [{ id: "a", nickname: "A" }]
  const result = computeCatchup({ record, items: [rent], split: { mode: "even" }, people })

  it("snapshots the catch-up, with the household's schedules beside the owner's", () => {
    const p = buildCatchupPayload({ result, record, cadences: defaultCadences(), currency: "USD" })
    expect(p).toMatchObject({
      kind: "catchup",
      period: "2026-09",
      title: "Move-in catch-up",
      shareCents: 149617,
      defaultPlan: "catchup",
      catchup: { moveIn: "2026-09-14", daysOccupied: 17, daysInMonth: 30, stubShareCents: 54117, nextMonthShareCents: 95500 },
    })
    // One row per statement: the prorated move-in month, then the full one.
    expect(p.lines).toEqual([
      {
        billedIn: "2026-09",
        label: "Rent",
        totalCents: 191000,
        shareCents: 54117,
        covers: "September 2026",
        prorated: { days: 17, of: 30 },
      },
      { billedIn: "2026-10", label: "Rent", totalCents: 191000, shareCents: 95500, covers: "October 2026" },
    ])
    // Rent covers the month it's billed in, so nothing is left for later.
    expect(p.catchup?.later).toBeUndefined()
    // The owner's installments first and by default, then the household's usual schedules.
    expect(p.plans.map((plan) => plan.key)).toEqual(["catchup", "full", "half", "weekly"])
    expect(sharePayloadSchema.safeParse(p).success).toBe(true)
  })

  it("names the bills whose last catch-up month lands on the statement after", () => {
    const water: ItemTemplate = {
      id: "water",
      label: "Water",
      kind: "fixed",
      enabled: true,
      defaultAmountCents: 6000,
      split: { mode: "default" },
      coverage: { offsetMonths: 1, spanMonths: 1 },
    }
    const withWater = computeCatchup({ record, items: [rent, water], split: { mode: "even" }, people })
    const p = buildCatchupPayload({ result: withWater, record, cadences: defaultCadences(), currency: "USD" })
    // October's statement carries September's water; October's own comes in November.
    expect(p.lines.filter((l) => l.label === "Water")).toMatchObject([
      { billedIn: "2026-10", covers: "September 2026", prorated: { days: 17, of: 30 } },
    ])
    expect(p.catchup?.later).toEqual(["Water"])
    expect(sharePayloadSchema.safeParse(p).success).toBe(true)
  })

  it("keeps what they've paid when the real bills replace the estimates", () => {
    const before = buildCatchupPayload({ result, record, cadences: defaultCadences(), currency: "USD" })
    const first = before.plans[0]!.payments[0]!.amountCents
    const paying: CatchupRecord = {
      ...record,
      paid: [{ id: "p1", amountCents: first, date: "2026-09-14" }],
      published: { at: "2026-09-14T00:00:00.000Z", hash: payloadHash(before), plans: publishedPlans(before) },
    }
    const higher = computeCatchup({
      record: paying,
      items: [{ ...rent, defaultAmountCents: 200000 }],
      split: { mode: "even" },
      people,
    })

    const after = buildCatchupPayload({ result: higher, record: paying, cadences: defaultCadences(), currency: "USD" })
    expect(after.shareCents).toBeGreaterThan(before.shareCents)
    expect(after.plans[0]!.payments[0]!.amountCents).toBe(first)
    expect(after.plans[0]!.payments.reduce((sum, p) => sum + p.amountCents, 0)).toBe(after.shareCents)
  })
})
