import { describe, expect, it } from "vitest"
import { computeCatchup } from "./catchup"
import { defaultCadences } from "./defaults"
import type { MonthRecord } from "./schema"
import {
  buildCatchupPayload,
  buildMonthlyPayload,
  lastDueOn,
  payloadHash,
  pickPlan,
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
})

describe("buildCatchupPayload", () => {
  it("snapshots the catch-up as a single plan", () => {
    const record = {
      personId: "a",
      moveIn: "2026-09-14",
      estimates: {},
      includeNextMonth: true,
      installments: 4,
      start: "2026-09-14",
      end: "2026-10-01",
      paid: [],
    }
    const result = computeCatchup({
      record,
      items: [{ id: "rent", label: "Rent", kind: "fixed", enabled: true, defaultAmountCents: 191000, split: { mode: "default" } }],
      split: { mode: "even" },
      people: [{ id: "a", nickname: "A" }],
    })
    const p = buildCatchupPayload({ result, record, currency: "USD" })
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
        label: "Rent",
        totalCents: 191000,
        shareCents: 54117,
        covers: "September 2026",
        prorated: { days: 17, of: 30 },
      },
      { label: "Rent", totalCents: 191000, shareCents: 95500, covers: "October 2026" },
    ])
    expect(p.plans).toHaveLength(1)
    expect(sharePayloadSchema.safeParse(p).success).toBe(true)
  })
})
