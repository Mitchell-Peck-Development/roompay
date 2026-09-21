import { describe, expect, it } from "vitest"
import { computeCatchup, defaultCatchupDates, maxOffsetMonths } from "./catchup"
import type { ItemTemplate } from "./schema"

const item = (id: string, cents: number): ItemTemplate => ({
  id,
  label: id,
  kind: "fixed",
  enabled: true,
  defaultAmountCents: cents,
  split: { mode: "default" },
})

// The numbers from the original Rent Ledger: $1,648 rent + $26 fees + $236 utilities.
describe("computeCatchup", () => {
  const items = [
    item("rent", 164800),
    item("fees", 2600),
    { ...item("utilities", 0), kind: "variable" as const },
    { ...item("disabled", 99999), enabled: false },
  ]
  const record = {
    personId: "a",
    moveIn: "2026-09-14",
    estimates: { utilities: 23600 },
    includeNextMonth: true,
    installments: 4,
    start: "2026-09-14",
    end: "2026-10-01",
    paid: [],
  }
  const people = [{ id: "a", nickname: "A" }]
  const r = computeCatchup({ record, items, split: { mode: "even" }, people })

  it("prorates the stub month by days occupied", () => {
    expect(r.fullMonthTotalCents).toBe(191000)
    expect(r.fullShareCents).toBe(95500)
    expect([r.daysOccupied, r.daysInMonth]).toEqual([17, 30])
    expect(r.stubShareCents).toBe(54117)
    // Each row is what they owe for that item across the whole catch-up:
    // 17 of 30 days of September, plus all of October.
    expect(r.lines.map((l) => [l.label, l.fullCents, l.shareCents])).toEqual([
      ["rent", 164800, 46693 + 82400],
      ["fees", 2600, 737 + 1300],
      ["utilities", 23600, 6687 + 11800],
    ])
    expect(r.statements.map((s) => [s.period, s.shareCents])).toEqual([
      ["2026-09", 54117],
      ["2026-10", 95500],
    ])
  })

  it("breaks a full month down item by item, and their share of each", () => {
    // The reference month, before anything is prorated: what each item costs
    // and what an even split of it comes to.
    expect(r.fullMonthLines.map((l) => [l.label, l.fullCents, l.shareCents])).toEqual([
      ["rent", 164800, 82400],
      ["fees", 2600, 1300],
      ["utilities", 23600, 11800],
    ])
    const summed = r.fullMonthLines.reduce((a, l) => a + l.shareCents, 0)
    expect(summed).toBe(r.fullShareCents)
    // And the catch-up rows add up to what they're actually asked for.
    expect(r.lines.reduce((a, l) => a + l.shareCents, 0)).toBe(r.combinedCents)
  })

  it("adds the next full month and spreads it evenly", () => {
    expect(r.nextMonthShareCents).toBe(95500)
    expect(r.combinedCents).toBe(149617)
    expect(r.plan.key).toBe("catchup")
    expect(r.plan.payments.map((p) => [p.date, p.amountCents])).toEqual([
      ["2026-09-14", 37405],
      ["2026-09-20", 37404],
      ["2026-09-25", 37404],
      ["2026-10-01", 37404],
    ])
  })

  it("can leave next month out, and handles one installment", () => {
    const solo = computeCatchup({
      record: { ...record, includeNextMonth: false, installments: 1 },
      items,
      split: { mode: "even" },
      people,
    })
    expect(solo.combinedCents).toBe(54117)
    expect(solo.plan.payments).toEqual([
      { date: "2026-09-14", amountCents: 54117, label: "Full amount" },
    ])
  })

  it("an estimate overrides a fixed default", () => {
    const o = computeCatchup({
      record: { ...record, estimates: { rent: 100000 } },
      items,
      split: { mode: "percent", pct: { a: 25 } },
      people,
    })
    expect(o.fullMonthTotalCents).toBe(102600)
    expect(o.fullShareCents).toBe(25650)
  })

  it("default dates", () =>
    expect(defaultCatchupDates("2026-09-14")).toEqual({ start: "2026-09-14", end: "2026-10-01" }))
})

describe("computeCatchup · offset bills", () => {
  const arrears = { offsetMonths: 1, spanMonths: 1 }
  const items: ItemTemplate[] = [
    { ...item("rent", 180000), coverage: { offsetMonths: 0, spanMonths: 1 } },
    { ...item("water", 8400), kind: "variable", coverage: arrears },
  ]
  const base = {
    personId: "a",
    moveIn: "2026-09-01",
    estimates: {},
    includeNextMonth: true,
    installments: 2,
    start: "2026-09-01",
    end: "2026-10-01",
    paid: [],
  }
  const people = [{ id: "a", nickname: "A" }]

  it("skips a bill that pays for service before they moved in", () => {
    const r = computeCatchup({ record: base, items, split: { mode: "even" }, people })
    // September's statement: all of September's rent, and a water bill for
    // August — which was none of theirs.
    expect(r.statements[0]!.lines.map((l) => [l.label, l.shareCents])).toEqual([
      ["rent", 90000],
      ["water", 0],
    ])
    // October's statement bills September's water, which is all theirs.
    expect(r.statements[1]!.lines.map((l) => [l.label, l.shareCents])).toEqual([
      ["rent", 90000],
      ["water", 4200],
    ])
    expect(r.combinedCents).toBe(184200)
  })

  it("still prorates an offset bill for a mid-month move-in", () => {
    const r = computeCatchup({
      record: { ...base, moveIn: "2026-09-16" },
      items,
      split: { mode: "even" },
      people,
    })
    // Half of September's rent now, and next month half of September's water.
    expect(r.statements[0]!.shareCents).toBe(45000)
    expect(r.statements[1]!.lines.find((l) => l.label === "water")!.shareCents).toBe(2100)
  })

  it("reports how far bills still look back", () => {
    expect(maxOffsetMonths(items)).toBe(1)
    expect(maxOffsetMonths([items[0]!])).toBe(0)
  })
})
