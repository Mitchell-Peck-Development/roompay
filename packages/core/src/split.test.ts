import { describe, expect, it } from "vitest"
import type { MonthLine } from "./schema"
import { OWNER, computeMonth, shareWeights, splitPctTotal } from "./split"

const line = (
  label: string,
  amountCents: number | null,
  split: MonthLine["split"] = { mode: "default" }
): MonthLine => ({ id: label, label, kind: "variable", amountCents, split })

const bill = [
  line("Rent", 164800),
  line("Service", 600),
  line("Trash", 2000),
  line("Sewer", 3800),
  line("Water", 3800),
  line("Power", 16000),
]
const one = [{ personId: "a", nickname: "A" }]
const two = [...one, { personId: "b", nickname: "B" }]

describe("computeMonth", () => {
  it("splits evenly with one roommate", () => {
    const m = computeMonth({ lines: bill, split: { mode: "even" }, participants: one })
    expect(m.totalCents).toBe(191000)
    expect(m.totals).toEqual({ [OWNER]: 95500, a: 95500 })
  })

  it("uses percentages, owner absorbs the rest", () => {
    const m = computeMonth({
      lines: bill,
      split: { mode: "percent", pct: { a: 40 } },
      participants: one,
    })
    expect(m.totals).toEqual({ [OWNER]: 114600, a: 76400 })
  })

  it("gives the odd cent to the owner on ties", () => {
    const m = computeMonth({ lines: [line("X", 100)], split: { mode: "even" }, participants: two })
    expect(m.lines[0]!.shares).toEqual({ [OWNER]: 34, a: 33, b: 33 })
  })

  it("honours per-line overrides, exclusions and credits", () => {
    const m = computeMonth({
      split: { mode: "even" },
      participants: two,
      lines: [
        line("Parking", 5000, { mode: "percent", pct: { b: 100 } }),
        line("Owner's storage", 3000, { mode: "exclude" }),
        line("Groceries credit", -4000, { mode: "percent", pct: { a: 100 } }),
      ],
    })
    expect(m.lines.map((l) => l.shares)).toEqual([
      { [OWNER]: 0, a: 0, b: 5000 },
      { [OWNER]: 3000, a: 0, b: 0 },
      { [OWNER]: 0, a: -4000, b: 0 },
    ])
    expect(m.totals).toEqual({ [OWNER]: 3000, a: -4000, b: 5000 })
  })

  it("treats unentered lines as zero and flags them", () => {
    const m = computeMonth({ lines: [line("Water", null)], split: { mode: "even" }, participants: one })
    expect(m.lines[0]).toMatchObject({ amountCents: 0, entered: false })
    expect(m.totalCents).toBe(0)
  })

  it("every line's shares sum to the line", () => {
    const m = computeMonth({
      lines: [line("A", 3333), line("B", 1), line("C", -77)],
      split: { mode: "percent", pct: { a: 33.33, b: 33.33 } },
      participants: two,
    })
    for (const l of m.lines)
      expect(Object.values(l.shares).reduce((x, y) => x + y, 0)).toBe(l.amountCents)
  })

  it("with nobody to split with, the owner carries everything", () => {
    const m = computeMonth({ lines: bill, split: { mode: "even" }, participants: [] })
    expect(m.totals).toEqual({ [OWNER]: 191000 })
  })

  it("weights", () => {
    expect(shareWeights({ mode: "percent", pct: { a: 40 } }, ["a"])).toEqual([6000, 4000])
    expect(shareWeights({ mode: "even" }, ["a", "b"])).toEqual([1, 1, 1])
    expect(shareWeights({ mode: "exclude" }, ["a"])).toEqual([1, 0])
    expect(shareWeights({ mode: "percent", pct: { a: 80, b: 80 } }, ["a", "b"])).toEqual([0, 8000, 8000])
    expect(splitPctTotal({ mode: "percent", pct: { a: 33.33, b: 20 } })).toBeCloseTo(53.33)
    expect(splitPctTotal({ mode: "even" })).toBe(0)
  })
})

describe("computeMonth · service windows", () => {
  const august = { start: "2026-08-01", end: "2026-08-31" }
  const september = { start: "2026-09-01", end: "2026-09-30" }
  const line = (id: string, amountCents: number, covers: { start: string; end: string }) => ({
    id,
    label: id,
    kind: "variable" as const,
    amountCents,
    split: { mode: "default" as const },
    covers,
  })

  it("leaves a roommate off a bill for service before they arrived", () => {
    // Water billed in September, covering August. Biscuit moved in Sept 1.
    const month = computeMonth({
      lines: [line("water", 8400, august)],
      split: { mode: "even" },
      participants: [{ personId: "biscuit", nickname: "Biscuit", from: "2026-09-01" }],
    })
    expect(month.lines[0]!.shares).toEqual({ owner: 8400, biscuit: 0 })
    expect(month.lines[0]!.prorated).toBe(true)
    expect(month.lines[0]!.occupancy.biscuit).toBe(0)
  })

  it("prorates by days inside the window, to the cent", () => {
    const month = computeMonth({
      lines: [line("rent", 180000, september)],
      split: { mode: "even" },
      participants: [{ personId: "biscuit", nickname: "Biscuit", from: "2026-09-16" }],
    })
    // 15 of 30 days of a half share.
    expect(month.lines[0]!.shares).toEqual({ owner: 135000, biscuit: 45000 })
    expect(month.totals.owner! + month.totals.biscuit!).toBe(180000)
  })

  it("hands what a latecomer doesn't owe to the owner, not the other roommates", () => {
    const month = computeMonth({
      lines: [line("rent", 90000, september)],
      split: { mode: "even" },
      participants: [
        { personId: "a", nickname: "A" },
        { personId: "b", nickname: "B", from: "2026-09-16" },
      ],
    })
    // A keeps a full third; B pays half of one; the owner picks up the rest.
    expect(month.lines[0]!.shares).toEqual({ owner: 45000, a: 30000, b: 15000 })
  })

  it("prorates a percent split the same way", () => {
    const month = computeMonth({
      lines: [line("rent", 100000, september)],
      split: { mode: "percent", pct: { a: 40 } },
      participants: [{ personId: "a", nickname: "A", to: "2026-09-15" }],
    })
    expect(month.lines[0]!.shares).toEqual({ owner: 80000, a: 20000 })
  })

  it("splits a line with no window whole, as months made before this did", () => {
    const month = computeMonth({
      lines: [{ id: "rent", label: "rent", kind: "variable", amountCents: 1000, split: { mode: "default" } }],
      split: { mode: "even" },
      participants: [{ personId: "a", nickname: "A", from: "2026-09-16" }],
    })
    expect(month.lines[0]!.shares).toEqual({ owner: 500, a: 500 })
    expect(month.lines[0]!.prorated).toBe(false)
  })
})

describe("splitting among some of us", () => {
  const two = [
    { personId: "a", nickname: "A" },
    { personId: "b", nickname: "B" },
  ]
  const three = [...two, { personId: "c", nickname: "C" }]

  it("shares evenly among exactly the people named", () => {
    const m = computeMonth({
      lines: [line("Parking", 9000, { mode: "only", personIds: ["b", OWNER] })],
      split: { mode: "even" },
      participants: two,
    })
    expect(m.lines[0]!.shares).toEqual({ [OWNER]: 4500, a: 0, b: 4500 })
  })

  it("leaves no stray cent with the owner, where percentages would", () => {
    const m = computeMonth({
      lines: [line("Groceries", -6000, { mode: "only", personIds: ["a", "b", "c"] })],
      split: { mode: "even" },
      participants: three,
    })
    expect(m.lines[0]!.shares).toEqual({ [OWNER]: 0, a: -2000, b: -2000, c: -2000 })
    expect(m.totals[OWNER]).toBe(0)
  })

  it("divides an odd amount without losing a cent", () => {
    const m = computeMonth({
      lines: [line("Credit", -5000, { mode: "only", personIds: ["a", "b", "c"] })],
      split: { mode: "even" },
      participants: three,
    })
    const shares = Object.values(m.lines[0]!.shares)
    expect(shares.reduce((sum, cents) => sum + cents, 0)).toBe(-5000)
    expect(shares.filter((c) => c !== 0).sort((x, y) => x - y)).toEqual([-1667, -1667, -1666])
  })

  it("'all roommates' follows the household as it changes", () => {
    const credit = line("Pizza I owe them", -6000, { mode: "roommates" })
    const withTwo = computeMonth({ lines: [credit], split: { mode: "even" }, participants: two })
    expect(withTwo.lines[0]!.shares).toEqual({ [OWNER]: 0, a: -3000, b: -3000 })

    const withThree = computeMonth({ lines: [credit], split: { mode: "even" }, participants: three })
    expect(withThree.lines[0]!.shares).toEqual({ [OWNER]: 0, a: -2000, b: -2000, c: -2000 })
  })

  it("falls back to the owner when it names nobody who's here", () => {
    const m = computeMonth({
      lines: [line("Odd one", 1000, { mode: "only", personIds: ["gone"] })],
      split: { mode: "even" },
      participants: two,
    })
    expect(m.lines[0]!.shares).toEqual({ [OWNER]: 1000, a: 0, b: 0 })
    const nobody = computeMonth({
      lines: [line("Credit", -1000, { mode: "roommates" })],
      split: { mode: "even" },
      participants: [],
    })
    expect(nobody.lines[0]!.shares).toEqual({ [OWNER]: -1000 })
  })

  it("a credit off the whole bill just follows the month's split", () => {
    const m = computeMonth({
      lines: [line("Blender", -5000, { mode: "default" })],
      split: { mode: "even" },
      participants: [{ personId: "a", nickname: "A" }],
    })
    expect(m.lines[0]!.shares).toEqual({ [OWNER]: -2500, a: -2500 })
  })
})
