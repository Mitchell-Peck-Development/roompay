import { describe, expect, it } from "vitest"
import * as D from "./dates"

describe("dates", () => {
  it("month lengths", () => {
    expect(D.daysInMonth("2026-02")).toBe(28)
    expect(D.daysInMonth("2028-02")).toBe(29)
    expect(D.daysInMonth("2026-09")).toBe(30)
  })

  it("clamps days", () => {
    expect(D.dateInPeriod("2026-02", 31)).toBe("2026-02-28")
    expect(D.dateInPeriod("2026-10", 1)).toBe("2026-10-01")
    expect(D.dateInPeriod("2026-10", 0)).toBe("2026-10-01")
  })

  it("walks periods", () => {
    expect(D.nextPeriod("2026-12")).toBe("2027-01")
    expect(D.prevPeriod("2026-01")).toBe("2025-12")
    expect(D.periodOf("2026-09-14")).toBe("2026-09")
  })

  it("formats", () => {
    expect(D.formatPeriod("2026-10")).toBe("October 2026")
    expect(D.formatShortDate("2026-10-01")).toBe("Oct 1")
    expect(D.formatLongDate("2026-10-01")).toBe("Thu, Oct 1")
  })

  it("day maths", () => {
    expect(D.addDays("2026-09-28", 5)).toBe("2026-10-03")
    expect(D.diffDays("2026-09-14", "2026-10-01")).toBe(17)
    expect(D.addDays("2026-03-07", 2)).toBe("2026-03-09") // across a DST change
    expect(D.addDays("2026-10-31", 1)).toBe("2026-11-01")
  })

  it("local date round trip", () => {
    expect(D.toISODate(new Date(2026, 8, 18, 23, 30))).toBe("2026-09-18")
    expect(D.parseISODate("2026-09-18").getDate()).toBe(18)
    expect(D.todayISO(new Date(2026, 0, 5))).toBe("2026-01-05")
  })

  it("defaults to next month late in the month", () => {
    expect(D.defaultPeriod(new Date(2026, 8, 18))).toBe("2026-09")
    expect(D.defaultPeriod(new Date(2026, 8, 25))).toBe("2026-10")
    expect(D.defaultPeriod(new Date(2026, 11, 30))).toBe("2027-01")
  })

  it("ordinals", () =>
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 31].map(D.ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "31st",
    ]))

  it("validates", () => {
    expect(D.isPeriod("2026-13")).toBe(false)
    expect(D.isPeriod("2026-10")).toBe(true)
    expect(D.isISODate("2026-02-30")).toBe(false)
    expect(D.isISODate("2026-02-28")).toBe(true)
    expect(D.isISODate("nope")).toBe(false)
  })
})
