import { describe, expect, it } from "vitest"
import { nextPeriod, shiftPeriod } from "./dates"
import {
  SAME_MONTH,
  coverageOf,
  coverageWindow,
  describeCoverage,
  describeDue,
  dueDateFor,
  dueRuleFrom,
  formatWindow,
  isDueLater,
  isOffset,
  normalizeCoverage,
  normalizeDue,
  residentDays,
  residentFraction,
  windowDays,
} from "./coverage"

describe("coverageWindow", () => {
  it("covers the month it's billed in by default", () => {
    expect(coverageWindow("2026-09")).toEqual({ start: "2026-09-01", end: "2026-09-30" })
    expect(coverageWindow("2026-09", SAME_MONTH)).toEqual(coverageWindow("2026-09"))
  })

  it("looks back for a bill in arrears", () => {
    // The water and sewer bill that lands end of September is August's.
    expect(coverageWindow("2026-09", { offsetMonths: 1, spanMonths: 1 })).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    })
    expect(coverageWindow("2026-01", { offsetMonths: 1, spanMonths: 1 })).toEqual({
      start: "2025-12-01",
      end: "2025-12-31",
    })
  })

  it("spans several months for a quarterly bill", () => {
    expect(coverageWindow("2026-10", { offsetMonths: 1, spanMonths: 3 })).toEqual({
      start: "2026-07-01",
      end: "2026-09-30",
    })
  })

  it("clamps nonsense", () => {
    expect(normalizeCoverage({ offsetMonths: -4, spanMonths: 0 })).toEqual({
      offsetMonths: 0,
      spanMonths: 1,
    })
    expect(normalizeCoverage(undefined)).toEqual(SAME_MONTH)
  })

  it("reads a window back as the coverage that made it", () => {
    const rules = [
      SAME_MONTH,
      { offsetMonths: 2, spanMonths: 3 },
      { offsetMonths: 1, spanMonths: 1, startDay: 28 },
      { offsetMonths: 2, spanMonths: 1, startDay: 3 },
      { offsetMonths: 0, spanMonths: 2, startDay: 15 },
      { offsetMonths: 1, spanMonths: 1, startDay: 1 },
    ]
    for (const coverage of rules) {
      expect(coverageOf("2026-09", coverageWindow("2026-09", coverage))).toEqual(coverage)
    }
    // A stretch that starts and ends on different days of the month isn't a
    // cycle any month could repeat.
    expect(coverageOf("2026-09", { start: "2026-08-03", end: "2026-09-10" })).toBeNull()
    // Nor is one that covers time after the bill was even issued.
    expect(coverageOf("2026-09", { start: "2026-11-01", end: "2026-11-30" })).toBeNull()
  })

  it("runs a meter cycle to the reading day of the month it bills for", () => {
    // Power read on the 28th, billed for last month and due on the 21st of
    // the month it lands in: September's statement is 28 July – 28 August,
    // and the money is asked for after that period has closed.
    const cycle = { offsetMonths: 1, spanMonths: 1, startDay: 28 }
    expect(coverageWindow("2026-09", cycle)).toEqual({
      start: "2026-07-28",
      end: "2026-08-28",
    })
    expect(dueDateFor("2026-09", { offsetMonths: 0, day: 21 })).toBe("2026-09-21")
    // October's statement moves on by exactly one cycle.
    expect(coverageWindow("2026-10", cycle)).toEqual({
      start: "2026-08-28",
      end: "2026-09-28",
    })

    // The reading day is the boundary, so it closes one statement and opens
    // the next — the same way the meter reading itself does.
    for (const startDay of [1, 15, 28, 30, 31]) {
      for (let i = 0; i < 12; i++) {
        const period = shiftPeriod("2026-01", i)
        const rule = { offsetMonths: 1, spanMonths: 1, startDay }
        expect(coverageWindow(period, rule).end).toBe(
          coverageWindow(nextPeriod(period), rule).start
        )
      }
    }

    // A quarterly cycle reaches back three months from its reading day.
    expect(coverageWindow("2026-09", { offsetMonths: 1, spanMonths: 3, startDay: 28 })).toEqual({
      start: "2026-05-28",
      end: "2026-08-28",
    })

    // A day past the end of a short month lands on its last day.
    expect(coverageWindow("2026-03", { offsetMonths: 1, spanMonths: 1, startDay: 31 })).toEqual({
      start: "2026-01-31",
      end: "2026-02-28",
    })

    // No day at all is plain calendar months; the 1st is a reading day like
    // any other, and means something different.
    expect(coverageWindow("2026-09", { offsetMonths: 1, spanMonths: 1 })).toEqual({
      start: "2026-08-01",
      end: "2026-08-31",
    })
    expect(coverageWindow("2026-09", { offsetMonths: 1, spanMonths: 1, startDay: 1 })).toEqual({
      start: "2026-07-01",
      end: "2026-08-01",
    })
    expect(normalizeCoverage({ offsetMonths: 0, spanMonths: 1, startDay: 99 })).toEqual({
      offsetMonths: 0,
      spanMonths: 1,
      startDay: 31,
    })
  })

  it("puts a bill on its usual day, clamped into short months", () => {
    expect(dueDateFor("2026-09", { offsetMonths: 0, day: 22 })).toBe("2026-09-22")
    expect(dueDateFor("2027-02", { offsetMonths: 0, day: 31 })).toBe("2027-02-28")
    expect(dueDateFor("2026-09", undefined)).toBeUndefined()
  })
})

describe("due dates", () => {
  it("lets a bill fall due after the month it's billed in", () => {
    // The sewer bill arrives in September for August's service, and isn't
    // due until the 1st of October.
    expect(dueDateFor("2026-09", { offsetMonths: 1, day: 1 })).toBe("2026-10-01")
    expect(dueDateFor("2026-12", { offsetMonths: 1, day: 15 })).toBe("2027-01-15")
    expect(dueDateFor("2026-09", { offsetMonths: 2, day: 5 })).toBe("2026-11-05")
    // And before it, for rent a landlord wants ahead of the month.
    expect(dueDateFor("2026-10", { offsetMonths: -1, day: 25 })).toBe("2026-09-25")
  })

  it("clamps the day into whatever month it lands in", () => {
    expect(dueDateFor("2027-01", { offsetMonths: 1, day: 31 })).toBe("2027-02-28")
  })

  it("reads a hand-picked date back as a rule that repeats", () => {
    expect(dueRuleFrom("2026-09", "2026-10-01")).toEqual({ offsetMonths: 1, day: 1 })
    expect(dueRuleFrom("2026-09", "2026-09-22")).toEqual({ offsetMonths: 0, day: 22 })
    expect(dueRuleFrom("2026-12", "2027-01-15")).toEqual({ offsetMonths: 1, day: 15 })
    // Round-trips, which is what makes next month's statement come out right.
    const rule = dueRuleFrom("2026-09", "2026-10-01")
    expect(dueDateFor("2026-10", rule)).toBe("2026-11-01")
  })

  it("reads the day-only form written before offsets existed", () => {
    expect(normalizeDue({ dueDay: 12 })).toEqual({ offsetMonths: 0, day: 12 })
    expect(normalizeDue({ due: { offsetMonths: 1, day: 1 }, dueDay: 9 })).toEqual({
      offsetMonths: 1,
      day: 1,
    })
    expect(normalizeDue({})).toBeUndefined()
  })

  it("says when it's due in words", () => {
    expect(describeDue({ offsetMonths: 0, day: 1 })).toBe(
      "Due the 1st of the month it's billed in."
    )
    expect(describeDue({ offsetMonths: 1, day: 1 })).toBe("Due the 1st of the following month.")
    expect(describeDue({ offsetMonths: -1, day: 25 })).toBe("Due the 25th of the month before.")
    expect(describeDue({ offsetMonths: 3, day: 2 })).toBe(
      "Due the 2nd, 3 months after it's billed."
    )
    expect(isDueLater({ offsetMonths: 1, day: 1 })).toBe(true)
    expect(isDueLater({ offsetMonths: 0, day: 1 })).toBe(false)
    expect(isDueLater(undefined)).toBe(false)
  })
})

describe("residency", () => {
  const august = { start: "2026-08-01", end: "2026-08-31" }

  it("counts someone with no dates as always here", () => {
    expect(residentFraction(august, {})).toBe(1)
    expect(windowDays(august)).toBe(31)
  })

  it("counts only the overlap", () => {
    expect(residentDays(august, { from: "2026-08-15" })).toBe(17)
    expect(residentDays(august, { to: "2026-08-10" })).toBe(10)
    expect(residentDays(august, { from: "2026-08-05", to: "2026-08-14" })).toBe(10)
  })

  it("is zero for someone who wasn't here at all", () => {
    expect(residentDays(august, { from: "2026-09-01" })).toBe(0)
    expect(residentFraction(august, { from: "2026-09-01" })).toBe(0)
    expect(residentDays(august, { to: "2026-07-31" })).toBe(0)
  })
})

describe("labels", () => {
  it("names whole months and falls back to dates", () => {
    expect(formatWindow({ start: "2026-08-01", end: "2026-08-31" })).toBe("August 2026")
    expect(formatWindow({ start: "2026-07-01", end: "2026-08-31" })).toBe("July – August 2026")
    expect(formatWindow({ start: "2026-08-03", end: "2026-09-02" })).toBe("Aug 3 – Sep 2")
  })

  it("describes an item's rule", () => {
    expect(describeCoverage(SAME_MONTH)).toBe("Covers the month it's billed in.")
    expect(describeCoverage({ offsetMonths: 1, spanMonths: 1 })).toBe("Covers the month before.")
    expect(describeCoverage({ offsetMonths: 2, spanMonths: 1 })).toBe("Covers 2 months back.")
    expect(describeCoverage({ offsetMonths: 1, spanMonths: 3 })).toBe(
      "Covers 3 months, ending with the month before."
    )
    expect(isOffset(SAME_MONTH)).toBe(false)
    expect(isOffset({ offsetMonths: 1, spanMonths: 1 })).toBe(true)
  })
})
