import { describe, expect, it } from "vitest"
import {
  dollarsToCents,
  formatDecimal,
  isNegative,
  mulDecimal,
  parseDecimal,
  subDecimal,
} from "./decimal"

const d = (s: string) => parseDecimal(s)!

describe("decimal", () => {
  it("parses", () => {
    expect(d("23.40")).toEqual({ value: 2340n, scale: 2 })
    expect(d("1,234.5")).toEqual({ value: 12345n, scale: 1 })
    expect(d("-1")).toEqual({ value: -1n, scale: 0 })
    expect(d(".5")).toEqual({ value: 5n, scale: 1 })
  })

  it.each(["", "abc", "1.2.3", ".", "-"])("rejects %j", (s) =>
    expect(parseDecimal(s)).toBeNull()
  )

  it("multiplies exactly and rounds half up", () => {
    expect(dollarsToCents(mulDecimal(d("23.4"), d("1.2345")))).toBe(2889) // 28.8873
    expect(dollarsToCents(mulDecimal(d("1"), d("0.005")))).toBe(1)
    expect(dollarsToCents(mulDecimal(d("3"), d("0.115")))).toBe(35) // 0.345 — floats get this wrong
    expect(dollarsToCents(d("-0.005"))).toBe(-1)
    expect(dollarsToCents(d("12"))).toBe(1200)
  })

  it("subtracts across scales", () => {
    expect(formatDecimal(subDecimal(d("1023.4"), d("1000")))).toBe("23.4")
    expect(isNegative(subDecimal(d("1"), d("2")))).toBe(true)
    expect(formatDecimal(d("5.00"))).toBe("5")
    expect(formatDecimal(d("-0.50"))).toBe("-0.5")
  })
})
