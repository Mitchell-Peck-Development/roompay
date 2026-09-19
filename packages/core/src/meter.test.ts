import { describe, expect, it } from "vitest"
import { lineAmountCents, meterDetail, meteredAmountCents } from "./meter"

const base = {
  unit: "therm",
  rate: "1.2345",
  baseFeeCents: 1200,
  input: "usage" as const,
}

describe("meter", () => {
  it("usage × rate + base fee", () =>
    expect(meteredAmountCents({ ...base, usage: "23.4" })).toBe(4089))

  it("derives usage from readings", () =>
    expect(
      meteredAmountCents({ ...base, input: "readings", prev: "1000", curr: "1023.4" })
    ).toBe(4089))

  it("is null until it can be computed", () => {
    expect(meteredAmountCents({ ...base })).toBeNull()
    expect(
      meteredAmountCents({ ...base, input: "readings", prev: "1023.4", curr: "1000" })
    ).toBeNull()
    expect(meteredAmountCents({ ...base, rate: "", usage: "5" })).toBeNull()
    expect(meteredAmountCents({ ...base, input: "readings", curr: "5" })).toBeNull()
  })

  it("describes itself", () => {
    expect(meterDetail({ ...base, usage: "23.4" }, "USD")).toBe(
      "23.4 therm × $1.2345 + $12.00"
    )
    expect(meterDetail({ ...base, baseFeeCents: 0, usage: "10" }, "USD")).toBe(
      "10 therm × $1.2345"
    )
    expect(meterDetail({ ...base }, "USD")).toBeUndefined()
  })

  it("lineAmountCents prefers the meter", () => {
    expect(
      lineAmountCents({
        id: "1",
        label: "Gas",
        kind: "metered",
        amountCents: null,
        split: { mode: "default" },
        meter: { ...base, usage: "23.4" },
      })
    ).toBe(4089)
    expect(
      lineAmountCents({
        id: "2",
        label: "Rent",
        kind: "fixed",
        amountCents: 164800,
        split: { mode: "default" },
      })
    ).toBe(164800)
  })
})
