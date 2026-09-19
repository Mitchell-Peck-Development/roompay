import { describe, expect, it } from "vitest"
import { defaultCadences } from "./defaults"
import { buildPlans, describeCadence, isGentle, largestPayment } from "./plans"

describe("buildPlans", () => {
  const plans = buildPlans(95500, defaultCadences(), "2026-10")

  it("builds the artifact's three options", () => {
    expect(plans.map((p) => p.key)).toEqual(["full", "half", "weekly"])
    expect(plans[0]!.payments).toEqual([
      { date: "2026-10-01", amountCents: 95500, label: "Full amount" },
    ])
    expect(plans[1]!.payments.map((p) => [p.date, p.amountCents])).toEqual([
      ["2026-10-01", 47750],
      ["2026-10-15", 47750],
    ])
    expect(plans[2]!.payments.map((p) => p.date)).toEqual([
      "2026-10-01", "2026-10-08", "2026-10-15", "2026-10-22",
    ])
    expect(plans[2]!.payments[1]!.label).toBe("Payment 2 of 4")
    expect(plans[2]!.description).toBe("4 equal payments: 1st, 8th, 15th and 22nd.")
  })

  it("payments always sum to the share", () => {
    for (const share of [95501, 1, 0, 33333])
      for (const p of buildPlans(share, defaultCadences(), "2026-10"))
        expect(p.payments.reduce((a, b) => a + b.amountCents, 0)).toBe(share)
    expect(
      buildPlans(95501, defaultCadences(), "2026-10")[2]!.payments.map((p) => p.amountCents)
    ).toEqual([23876, 23875, 23875, 23875])
  })

  it("clamps to short months and merges collisions", () => {
    const [p] = buildPlans(
      9000,
      [{ id: "x", key: "late", name: "Late", days: [31, 29, 30, 29] }],
      "2026-02"
    )
    expect(p!.payments).toEqual([
      { date: "2026-02-28", amountCents: 9000, label: "Full amount" },
    ])
  })

  it("flags heavy plans", () => {
    expect(largestPayment(plans[2]!)).toBe(23875)
    expect(isGentle(plans[0]!, 95500)).toBe(false)
    expect(isGentle(plans[1]!, 95500)).toBe(true)
  })

  it("describes cadences", () => {
    expect(describeCadence([1])).toBe("Due on the 1st.")
    expect(describeCadence([1, 15])).toBe("Half on the 1st, half on the 15th.")
    expect(describeCadence([1, 8, 15, 22])).toBe("4 equal payments: 1st, 8th, 15th and 22nd.")
    expect(describeCadence([5, 1, 5])).toBe("Half on the 1st, half on the 5th.")
  })
})
