import { describe, expect, it } from "vitest"
import { computeCatchup, defaultCatchupDates } from "./catchup"
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
    expect(r.lines.map((l) => [l.label, l.fullCents, l.shareCents])).toEqual([
      ["rent", 164800, 82400],
      ["fees", 2600, 1300],
      ["utilities", 23600, 11800],
    ])
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
