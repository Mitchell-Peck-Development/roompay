import { describe, expect, it } from "vitest"
import { createInitialData, newMonth } from "./defaults"
import { appDataSchema } from "./schema"

describe("defaults", () => {
  const now = new Date(2026, 8, 18)

  it("initial data is schema-valid with the artifact's line items and cadences", () => {
    const data = createInitialData(now)
    expect(appDataSchema.safeParse(data).success).toBe(true)
    expect(data.items.map((i) => i.label)).toEqual([
      "Rent", "Service fee", "Trash disposal", "Sewer", "Water", "Power",
    ])
    expect(data.cadences.map((c) => [c.key, c.days])).toEqual([
      ["full", [1]],
      ["half", [1, 15]],
      ["weekly", [1, 8, 15, 22]],
    ])
    expect(data.current.period).toBe("2026-09")
    expect(data.split).toEqual({ mode: "even" })
  })

  it("new month prefills fixed lines, blanks variable ones, rolls meter readings", () => {
    const data = createInitialData(now)
    data.items[0]!.defaultAmountCents = 164800
    data.items.push({
      id: "gas",
      label: "Gas",
      kind: "metered",
      enabled: true,
      split: { mode: "default" },
      meter: { unit: "therm", rate: "1.2345", baseFeeCents: 1200, input: "readings" },
    })
    data.items[1]!.enabled = false
    data.people.push({ id: "a", nickname: "Biscuit" })
    data.people.push({ id: "z", nickname: "Gone", archived: true })

    const sept = newMonth(data, "2026-09", now)
    sept.lines.find((l) => l.templateId === "gas")!.meter!.curr = "1023.4"
    data.months.push(sept)

    const oct = newMonth(data, "2026-10", now)
    expect(oct.title).toBe("October 2026")
    expect(oct.lines.map((l) => l.label)).toEqual([
      "Rent", "Trash disposal", "Sewer", "Water", "Power", "Gas",
    ])
    expect(oct.lines[0]!.amountCents).toBe(164800)
    expect(oct.lines[2]!.amountCents).toBeNull()
    expect(oct.lines.at(-1)!.meter).toMatchObject({ prev: "1023.4", unit: "therm" })
    expect(oct.lines.at(-1)!.meter!.curr).toBeUndefined()
    expect(oct.participants).toEqual([{ personId: "a", nickname: "Biscuit" }])
    expect(oct.id).not.toBe(sept.id)
  })
})
