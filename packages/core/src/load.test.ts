import { describe, expect, it } from "vitest"
import { createInitialData } from "./defaults"
import { parseAppData } from "./load"
import * as M from "./mutations"
import type { AppData } from "./schema"

const now = new Date(2026, 8, 19)

/** A document with two saved months, a roommate and a link. */
function saved(): AppData {
  const data = createInitialData(now)
  const biscuit = M.addPerson(data, "Biscuit")
  const rent = data.current.lines.find((l) => l.label === "Rent")!
  M.setLineAmount(data, rent.id, 164800, now)
  M.saveCurrent(data, now)
  M.ensureLink(data, biscuit, now)
  M.startNewMonth(data, "2026-10", now)
  M.setLineAmount(data, data.current.lines.find((l) => l.label === "Rent")!.id, 165000, now)
  M.saveCurrent(data, now)
  return data
}

const stored = (data: AppData) => JSON.parse(JSON.stringify(data))

describe("parseAppData", () => {
  it("reads a good document unchanged", () => {
    const data = saved()
    expect(parseAppData(stored(data), now)).toEqual({ data, dropped: [], fresh: false })
  })

  it("keeps the months it can read when one is damaged", () => {
    const raw = stored(saved())
    raw.months[0].period = "not-a-month"

    const result = parseAppData(raw, now)
    expect(result.fresh).toBe(false)
    expect(result.data.months.map((m) => m.period)).toEqual(["2026-09"])
    expect(result.dropped).toContain("1 saved month")
    // The rest of the document is untouched.
    expect(result.data.people[0]!.nickname).toBe("Biscuit")
    expect(Object.keys(result.data.links)).toHaveLength(1)
  })

  it("keeps a month when only one of its bill lines is damaged", () => {
    const raw = stored(saved())
    const september = raw.months.find((m: { period: string }) => m.period === "2026-09")
    september.lines[2].amountCents = "lots"

    const result = parseAppData(raw, now)
    const kept = result.data.months.find((m) => m.period === "2026-09")!
    expect(kept.lines).toHaveLength(5)
    expect(kept.lines.find((l) => l.label === "Rent")!.amountCents).toBe(164800)
    expect(result.dropped).toContain("1 bill line")
  })

  it("drops only the roommate, link or catch-up that can't be read", () => {
    const raw = stored(saved())
    raw.people.push({ id: "broken", nickname: 42 })
    raw.links["someone"] = { token: "too-short", writeKey: "x", createdAt: "now" }
    raw.catchups["someone"] = { personId: "someone", moveIn: "yesterday" }

    const result = parseAppData(raw, now)
    expect(result.data.people.map((p) => p.nickname)).toEqual(["Biscuit"])
    expect(Object.keys(result.data.links)).toHaveLength(1)
    expect(result.data.catchups).toEqual({})
    expect(result.dropped).toEqual(
      expect.arrayContaining(["1 roommate", "1 share link", "1 move-in catch-up"])
    )
  })

  it("rebuilds the working month from what's left, rather than losing the lot", () => {
    const raw = stored(saved())
    raw.current = { nonsense: true }

    const result = parseAppData(raw, now)
    expect(result.fresh).toBe(false)
    expect(result.data.months).toHaveLength(2)
    expect(result.data.current.lines.map((l) => l.label)).toEqual([
      "Rent", "Service fee", "Trash disposal", "Sewer", "Water", "Power",
    ])
    expect(result.dropped).toContain("the month you were working on")
  })

  it("falls back to settings it can't read without dropping the months", () => {
    const raw = stored(saved())
    raw.split = { mode: "sideways" }
    raw.household = { label: "Unit 3012", currency: "US DOLLARS" }

    const result = parseAppData(raw, now)
    expect(result.data.split).toEqual({ mode: "even" })
    expect(result.data.household).toEqual({ label: "Unit 3012", currency: "USD" })
    expect(result.data.months).toHaveLength(2)
    expect(result.dropped.length).toBeGreaterThan(0)
  })

  it("keeps the document when a timestamp is damaged", () => {
    const raw = stored(saved())
    raw.meta.lastBackupAt = { when: "yesterday" }
    raw.meta.createdAt = 12345

    const result = parseAppData(raw, now)
    expect(result.fresh).toBe(false)
    expect(result.data.months).toHaveLength(2)
    expect(result.data.meta.lastBackupAt).toBeUndefined()
    expect(result.data.meta.createdAt).toBe(now.toISOString())
  })

  it("starts fresh only when there's nothing to read", () => {
    for (const raw of [null, "nonsense", 42, []]) {
      const result = parseAppData(raw, now)
      expect(result.fresh).toBe(true)
      expect(result.dropped).toEqual(["everything that was saved"])
      expect(result.data.people).toEqual([])
    }
  })
})
