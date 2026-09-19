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
