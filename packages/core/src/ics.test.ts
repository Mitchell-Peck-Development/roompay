import { describe, expect, it } from "vitest"
import { buildCalendar, escapeText, foldLine, statementEvents } from "./ics"

const stamp = new Date(Date.UTC(2026, 8, 18, 12, 0, 0))

describe("ics", () => {
  it("escapes text", () =>
    expect(escapeText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne"))

  it("folds at 75 octets without breaking characters", () => {
    const ascii = "X".repeat(200)
    const accented = "DESCRIPTION:" + "é".repeat(100)
    const emoji = "SUMMARY:" + "🏠".repeat(40)
    for (const line of [ascii, accented, emoji]) {
      const parts = foldLine(line).split("\r\n")
      expect(parts.length).toBeGreaterThan(1)
      for (const part of parts)
        expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75)
      expect(parts.map((p, i) => (i ? p.slice(1) : p)).join("")).toBe(line)
    }
    expect(foldLine("SHORT")).toBe("SHORT")
  })

  it("builds a valid all-day calendar", () => {
    const ics = buildCalendar({
      name: "RoomPay · Unit 3012",
      refreshMinutes: 60,
      events: [
        {
          uid: "u1@roompay",
          date: "2026-10-31",
          summary: "Pay $10.00 · Unit 3012",
          description: "line1\nline2",
          url: "https://x/r/t",
          sequence: 3,
          stamp,
          alarm: true,
        },
      ],
    })
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true)
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true)
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/)
    for (const needle of [
      "PRODID:-//RoomPay//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "X-WR-CALNAME:RoomPay · Unit 3012",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
      "UID:u1@roompay",
      "DTSTAMP:20260918T120000Z",
      "LAST-MODIFIED:20260918T120000Z",
      "DTSTART;VALUE=DATE:20261031",
      "DTEND;VALUE=DATE:20261101",
      "SUMMARY:Pay $10.00 · Unit 3012",
      "SEQUENCE:3",
      "TRANSP:TRANSPARENT",
      "DESCRIPTION:line1\\nline2",
      "URL:https://x/r/t",
      "BEGIN:VALARM",
      "TRIGGER:PT9H",
      "END:VEVENT",
    ])
      expect(ics).toContain(needle)
  })

  it("an empty calendar is still valid", () => {
    const ics = buildCalendar({ name: "x", events: [] })
    expect(ics).toContain("END:VCALENDAR")
    expect(ics).not.toContain("BEGIN:VEVENT")
    expect(ics).not.toContain("REFRESH-INTERVAL")
  })

  it("turns a plan into events with stable ids", () => {
    const plan = {
      key: "half",
      name: "Split in two",
      payments: [
        { date: "2026-10-01", amountCents: 47750, label: "Payment 1 of 2" },
        { date: "2026-10-15", amountCents: 47750, label: "Payment 2 of 2" },
      ],
    }
    const payload = {
      v: 1 as const,
      kind: "monthly" as const,
      period: "2026-10",
      title: "October 2026",
      currency: "USD",
      lines: [],
      totalCents: 191000,
      shareCents: 95500,
      plans: [plan],
      defaultPlan: "half",
    }
    const events = statementEvents({
      linkId: "L1",
      householdLabel: "Unit 3012",
      payload,
      plan,
      revision: 2,
      updatedAt: stamp,
      pageUrl: "https://x/r/t",
    })
    expect(events.map((e) => e.uid)).toEqual([
      "L1-2026-10-monthly-half-1@roompay",
      "L1-2026-10-monthly-half-2@roompay",
    ])
    expect(events[0]).toMatchObject({
      date: "2026-10-01",
      summary: "Pay $477.50 · Unit 3012",
      sequence: 2,
      url: "https://x/r/t",
      alarm: true,
    })
    expect(events[0]!.description).toContain("October 2026 · Split in two · Payment 1 of 2")
    expect(events[0]!.description).toContain("1. Oct 1 — $477.50")
    expect(events[0]!.description).toContain("https://x/r/t")
    expect(
      statementEvents({ linkId: "L1", householdLabel: "", payload, plan, revision: 1, updatedAt: stamp })[0]!.summary
    ).toBe("Pay $477.50 · RoomPay")
  })
})
