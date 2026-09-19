import { describe, expect, it } from "vitest"
import {
  allocate,
  formatAmountInput,
  formatMoney,
  parseMoney,
  splitEven,
} from "./money"

describe("parseMoney", () => {
  it.each([
    ["1,648.00", 164800],
    ["$6", 600],
    ["20.5", 2050],
    [".5", 50],
    ["1648.", 164800],
    ["-40", -4000],
    [" 12 ", 1200],
    ["0", 0],
  ])("%s → %i", (input, cents) => expect(parseMoney(input)).toBe(cents))

  it.each(["", "abc", "1.234", "1..2", "--4", "$", "-", "."])(
    "rejects %j",
    (input) => expect(parseMoney(input)).toBeNull()
  )
})

describe("formatMoney", () => {
  it("formats", () => {
    expect(formatMoney(164800)).toBe("$1,648.00")
    expect(formatMoney(-4000)).toBe("-$40.00")
    expect(formatMoney(5, "USD")).toBe("$0.05")
  })

  it("input form", () => {
    expect(formatAmountInput(164800)).toBe("1648.00")
    expect(formatAmountInput(null)).toBe("")
    expect(formatAmountInput(-4000)).toBe("-40.00")
    expect(formatAmountInput(5)).toBe("0.05")
  })
})

describe("allocate", () => {
  it("sums exactly", () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(allocate(101, [1, 1])).toEqual([51, 50])
    expect(allocate(1000, [5000, 5000])).toEqual([500, 500])
    expect(allocate(999, [0, 10000])).toEqual([0, 999])
  })

  it("mirrors negatives", () =>
    expect(allocate(-101, [1, 1])).toEqual([-51, -50]))

  it("gives everything to index 0 when no weights", () =>
    expect(allocate(100, [0, 0])).toEqual([100, 0]))

  it("always conserves the total", () => {
    for (let total = -250; total <= 250; total += 7)
      for (const w of [
        [1, 1, 1],
        [3333, 3333, 3334],
        [6000, 4000],
        [1, 2, 3, 4],
      ])
        expect(allocate(total, w).reduce((a, b) => a + b, 0)).toBe(total)
  })
})

describe("splitEven", () => {
  it("front-loads odd cents", () => {
    expect(splitEven(100, 3)).toEqual([34, 33, 33])
    expect(splitEven(95501, 4)).toEqual([23876, 23875, 23875, 23875])
    expect(splitEven(-100, 3)).toEqual([-34, -33, -33])
    expect(splitEven(5, 0)).toEqual([])
  })
})
