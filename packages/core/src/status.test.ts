import { describe, expect, it } from "vitest"
import { STATUS_LABEL, paymentStatuses, statusRank, todayInTimeZone } from "./status"

const plan = {
  key: "weekly",
  name: "Weekly",
  payments: ["01", "08", "15", "18", "22"].map((d, i) => ({
    date: `2026-10-${d}`,
    amountCents: 10000,
    label: `Payment ${i + 1} of 5`,
  })),
}

describe("paymentStatuses", () => {
  it("counts down to each due date (today = Oct 15)", () => {
    expect(paymentStatuses(plan, 0, "2026-10-15").map((r) => r.status)).toEqual([
      "overdue", // Oct 1
      "overdue", // Oct 8
      "pay_now", // today
      "pending", // 3 days out
      "future", // 7 days out
    ])
  })

  it("draws the pending window at 1–3 days", () => {
    const at = (today: string) => paymentStatuses(plan, 0, today)[4]!.status
    expect(at("2026-10-18")).toBe("future") // 4 days before the 22nd
    expect(at("2026-10-19")).toBe("pending") // 3 days
    expect(at("2026-10-21")).toBe("pending") // 1 day
    expect(at("2026-10-22")).toBe("pay_now")
    expect(at("2026-10-23")).toBe("overdue")
  })

  it("marks what's been received as paid, oldest first — early payments too", () => {
    const rows = paymentStatuses(plan, 25000, "2026-10-15")
    expect(rows.map((r) => [r.status, r.remainingCents])).toEqual([
      ["paid", 0],
      ["paid", 0],
      ["pay_now", 5000], // half covered: only the rest is still owed
      ["pending", 10000],
      ["future", 10000],
    ])
    expect(paymentStatuses(plan, 50000, "2026-09-01").every((r) => r.status === "paid")).toBe(true)
  })

  it("labels and ranks", () => {
    expect(Object.values(STATUS_LABEL)).toEqual(["Future", "Pending", "Pay now", "Overdue", "Paid"])
    expect(["future", "pending", "pay_now", "overdue", "paid"].map((s) => statusRank(s as never))).toEqual([0, 1, 2, 3, 4])
  })
})

describe("todayInTimeZone", () => {
  // 03:30 UTC on Oct 15 is still the evening of Oct 14 on the US east coast.
  const now = new Date(Date.UTC(2026, 9, 15, 3, 30))
  it("uses the roommate's calendar day", () => {
    expect(todayInTimeZone("America/New_York", now)).toBe("2026-10-14")
    expect(todayInTimeZone("Asia/Tokyo", now)).toBe("2026-10-15")
    expect(todayInTimeZone("UTC", now)).toBe("2026-10-15")
  })
  it("falls back to UTC for anything unusable", () => {
    expect(todayInTimeZone("Not/AZone", now)).toBe("2026-10-15")
    expect(todayInTimeZone(null, now)).toBe("2026-10-15")
    expect(todayInTimeZone("x".repeat(200), now)).toBe("2026-10-15")
  })
})
