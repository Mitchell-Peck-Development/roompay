import { describe, expect, it } from "vitest"
import { paidProgress } from "./paid"

const plan = {
  key: "weekly",
  name: "Weekly",
  payments: ["01", "08", "15", "22"].map((d, i) => ({
    date: `2026-10-${d}`,
    amountCents: 23875,
    label: `Payment ${i + 1} of 4`,
  })),
}
const entry = (amountCents: number) => ({
  id: String(amountCents),
  amountCents,
  date: "2026-10-01",
})

describe("paidProgress", () => {
  it("starts with everything due", () => {
    const p = paidProgress(plan, [])
    expect(p.rows.every((r) => r.status === "due")).toBe(true)
    expect([p.paidCents, p.remainingCents]).toEqual([0, 95500])
  })

  it("fills rows greedily in date order", () => {
    const p = paidProgress(plan, [entry(30000)])
    expect(p.rows.map((r) => [r.status, r.paidCents])).toEqual([
      ["paid", 23875],
      ["partial", 6125],
      ["due", 0],
      ["due", 0],
    ])
    expect([p.paidCents, p.remainingCents, p.overpaidCents]).toEqual([30000, 65500, 0])
  })

  it("accepts a plain received total", () => {
    expect(paidProgress(plan, 30000)).toEqual(paidProgress(plan, [entry(30000)]))
  })

  it("reports overpayment", () => {
    const p = paidProgress(plan, [entry(100000)])
    expect(p.rows.every((r) => r.status === "paid")).toBe(true)
    expect(p.overpaidCents).toBe(4500)
    expect(p.remainingCents).toBe(0)
  })
})
