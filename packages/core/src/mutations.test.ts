import { beforeEach, describe, expect, it } from "vitest"
import { createInitialData } from "./defaults"
import * as M from "./mutations"
import { type AppData, appDataSchema } from "./schema"

const now = new Date(2026, 8, 18)
let data: AppData
let biscuit: string

const line = (label: string) => data.current.lines.find((l) => l.label === label)!
const item = (label: string) => data.items.find((t) => t.label === label)!

beforeEach(() => {
  data = createInitialData(now)
  biscuit = M.addPerson(data, " Biscuit ")
})

describe("people", () => {
  it("joins the working month, trimmed", () => {
    expect(data.current.participants).toEqual([{ personId: biscuit, nickname: "Biscuit" }])
  })

  it("renames and archives flow through to the working month", () => {
    M.renamePerson(data, biscuit, "3012-B")
    expect(data.current.participants[0]!.nickname).toBe("3012-B")
    M.setPersonArchived(data, biscuit, true)
    expect(data.current.participants).toEqual([])
    M.setPersonArchived(data, biscuit, false)
    expect(data.current.participants).toHaveLength(1)
  })

  it("only deletes someone with no history and no link", () => {
    M.saveCurrent(data, now)
    expect(M.canRemovePerson(data, biscuit)).toBe(false)
    M.removePerson(data, biscuit)
    expect(data.people).toHaveLength(1)

    const fresh = M.addPerson(data, "New")
    M.ensureLink(data, fresh, now)
    expect(M.canRemovePerson(data, fresh)).toBe(false)
    M.forgetLink(data, fresh)
    M.removePerson(data, fresh)
    expect(data.people.map((p) => p.id)).toEqual([biscuit])
  })
})

describe("line items", () => {
  it("a new item appears in the working month, in template order", () => {
    M.addOneOffLine(data, { label: "Couch", amountCents: 12000 }, now)
    M.upsertItem(data, {
      id: "gas",
      label: "Gas",
      kind: "metered",
      enabled: true,
      split: { mode: "default" },
      meter: { unit: "therm", rate: "1.2", baseFeeCents: 0, input: "usage" },
    })
    expect(data.current.lines.map((l) => l.label)).toEqual([
      "Rent", "Service fee", "Trash disposal", "Sewer", "Water", "Power", "Gas", "Couch",
    ])
    expect(line("Gas").meter).toEqual({ unit: "therm", rate: "1.2", baseFeeCents: 0, input: "usage" })
  })

  it("carries a month's split back to the item when asked, and not before", () => {
    M.setLineSplit(data, line("Power").id, { mode: "exclude" }, now)
    expect(item("Power").split).toEqual({ mode: "default" })
    // Next month would have gone back to the usual split; this makes it stick.
    M.setItemSplit(data, item("Power").id, { mode: "exclude" })
    expect(item("Power").split).toEqual({ mode: "exclude" })
  })

  it("sets an item's usual amount on its own, and clears it", () => {
    M.setItemDefaultAmount(data, item("Rent").id, 170000)
    expect(item("Rent").defaultAmountCents).toBe(170000)
    // The month that's open keeps whatever it already said.
    expect(line("Rent").amountCents).toBeNull()
    M.setItemDefaultAmount(data, item("Rent").id, null)
    expect(item("Rent").defaultAmountCents).toBeUndefined()
  })

  it("editing an item keeps what was entered", () => {
    M.setLineAmount(data, line("Water").id, 3800, now)
    M.upsertItem(data, { ...item("Water"), label: "Water & sewer", split: { mode: "exclude" } })
    expect(line("Water & sewer")).toMatchObject({ amountCents: 3800, split: { mode: "exclude" } })
  })

  it("editing a meter's settings keeps its readings, unless the input mode changes", () => {
    M.upsertItem(data, {
      id: "gas", label: "Gas", kind: "metered", enabled: true, split: { mode: "default" },
      meter: { unit: "therm", rate: "1.2", baseFeeCents: 0, input: "usage" },
    })
    M.setLineMeter(data, line("Gas").id, { usage: "23.4" }, now)
    M.upsertItem(data, { ...item("Gas"), meter: { unit: "CCF", rate: "1.5", baseFeeCents: 500, input: "usage" } })
    expect(line("Gas").meter).toEqual({ unit: "CCF", rate: "1.5", baseFeeCents: 500, input: "usage", usage: "23.4" })
    M.upsertItem(data, { ...item("Gas"), meter: { unit: "CCF", rate: "1.5", baseFeeCents: 500, input: "readings" } })
    expect(line("Gas").meter).toEqual({ unit: "CCF", rate: "1.5", baseFeeCents: 500, input: "readings" })
  })

  it("disabling or removing an item only drops lines with nothing entered", () => {
    M.setLineAmount(data, line("Water").id, 3800, now)
    M.upsertItem(data, { ...item("Water"), enabled: false })
    M.upsertItem(data, { ...item("Sewer"), enabled: false })
    M.removeItem(data, item("Power").id)
    expect(data.current.lines.map((l) => l.label)).toEqual(["Rent", "Service fee", "Trash disposal", "Water"])
  })

  it("reordering items reorders the month", () => {
    M.moveItem(data, item("Power").id, -1)
    M.moveItem(data, item("Rent").id, -1) // already first: no-op
    expect(data.current.lines.map((l) => l.label).slice(3)).toEqual(["Sewer", "Power", "Water"])
  })

  it("a fixed amount becomes next month's starting point; a variable one doesn't", () => {
    M.setLineAmount(data, line("Rent").id, 164800, now)
    M.setLineAmount(data, line("Water").id, 3800, now)
    expect(item("Rent").defaultAmountCents).toBe(164800)
    expect(item("Water").defaultAmountCents).toBeUndefined()
    M.startNewMonth(data, "2026-10", now)
    expect(line("Rent").amountCents).toBe(164800)
    expect(line("Water").amountCents).toBeNull()
  })

  it("remembers a changed meter rate, and clears blanked readings", () => {
    M.upsertItem(data, {
      id: "gas", label: "Gas", kind: "metered", enabled: true, split: { mode: "default" },
      meter: { unit: "therm", rate: "1.2", baseFeeCents: 0, input: "usage" },
    })
    M.setLineMeter(data, line("Gas").id, { rate: "1.31", usage: "10" }, now)
    expect(item("Gas").meter!.rate).toBe("1.31")
    M.setLineMeter(data, line("Gas").id, { usage: "" }, now)
    expect(line("Gas").meter).not.toHaveProperty("usage")
  })

  it("cadence keys are minted once and never change", () => {
    M.upsertCadence(data, { id: "x", name: "Thirds", days: [20, 1, 10, 10] })
    const made = data.cadences.at(-1)!
    expect(made.days).toEqual([1, 10, 20])
    expect(made.key).toMatch(/^c-[0-9a-f]{8}$/)
    M.upsertCadence(data, { id: "x", name: "Renamed", days: [1, 11, 21], key: "hijack" })
    expect(data.cadences.at(-1)).toMatchObject({ name: "Renamed", key: made.key })
    for (const c of [...data.cadences]) M.removeCadence(data, c.id)
    expect(data.cadences).toHaveLength(1)
  })
})

describe("saving months", () => {
  it("tracks unsaved changes", () => {
    expect(M.isDirty(data)).toBe(true)
    M.saveCurrent(data, now)
    expect(M.isDirty(data)).toBe(false)
    expect(data.months).toHaveLength(1)
    M.setLineAmount(data, line("Water").id, 100, now)
    expect(M.isDirty(data)).toBe(true)
    M.saveCurrent(data, now)
    expect(data.months).toHaveLength(1)
    expect(appDataSchema.safeParse(data).success).toBe(true)
  })

  it("opens a saved month as a copy, newest month first", () => {
    M.saveCurrent(data, now)
    const september = data.current.id
    M.startNewMonth(data, "2026-10", now)
    M.saveCurrent(data, now)
    expect(data.months.map((m) => m.period)).toEqual(["2026-10", "2026-09"])
    M.openMonth(data, september)
    M.setMonthTitle(data, "edited", now)
    expect(data.months.find((m) => m.id === september)!.title).toBe("September 2026")
  })

  it("deleting the open month leaves it as an unsaved working copy", () => {
    M.saveCurrent(data, now)
    M.deleteMonth(data, data.current.id)
    expect(data.months).toEqual([])
    expect(data.current.savedAt).toBeUndefined()
    expect(M.isDirty(data)).toBe(true)
  })
})

describe("paid and published", () => {
  it("write through to the saved copy without making the month dirty", () => {
    M.saveCurrent(data, now)
    const ref = { kind: "monthly", monthId: data.current.id } as const
    M.addPaid(data, ref, biscuit, { amountCents: 5000, date: "2026-09-18" })
    M.setPublished(data, ref, biscuit, { at: "t", hash: "h" })
    expect(data.months[0]!.paid[biscuit]).toHaveLength(1)
    expect(data.months[0]!.published[biscuit]).toEqual({ at: "t", hash: "h" })
    expect(M.isDirty(data)).toBe(false)

    M.removePaid(data, ref, biscuit, data.current.paid[biscuit]![0]!.id)
    expect(data.months[0]!.paid[biscuit]).toEqual([])
    M.setPublished(data, ref, biscuit, null)
    expect(data.current.published).toEqual({})
  })

  it("reach a saved month that isn't the open one", () => {
    M.saveCurrent(data, now)
    const september = data.current.id
    M.startNewMonth(data, "2026-10", now)
    M.addPaid(data, { kind: "monthly", monthId: september }, biscuit, { amountCents: 1, date: "2026-09-18" })
    expect(data.months[0]!.paid[biscuit]).toHaveLength(1)
    expect(data.current.paid).toEqual({})
  })

  it("forgetting a link clears every published marker for that person", () => {
    const first = M.ensureLink(data, biscuit, now)
    expect(M.ensureLink(data, biscuit, now)).toBe(first)
    expect(first.token).not.toBe(first.writeKey)
    M.saveCurrent(data, now)
    M.setPublished(data, { kind: "monthly", monthId: data.current.id }, biscuit, { at: "t", hash: "h" })
    M.ensureCatchup(data, biscuit, "2026-09-14")
    M.setPublished(data, { kind: "catchup" }, biscuit, { at: "t", hash: "h" })

    M.forgetLink(data, biscuit)
    expect(data.links).toEqual({})
    expect(data.current.published).toEqual({})
    expect(data.months[0]!.published).toEqual({})
    expect(data.catchups[biscuit]!.published).toBeUndefined()
    expect(M.ensureLink(data, biscuit, now).token).not.toBe(first.token)
  })
})

describe("catch-up", () => {
  it("starts from the artifact's defaults", () => {
    expect(M.ensureCatchup(data, biscuit, "2026-09-14")).toMatchObject({
      moveIn: "2026-09-14", start: "2026-09-14", end: "2026-10-01", installments: 4, includeNextMonth: true,
    })
  })

  it("the schedule follows the move-in date until the dates are customised", () => {
    M.ensureCatchup(data, biscuit, "2026-09-14")
    M.patchCatchup(data, biscuit, { moveIn: "2026-11-20" }, now)
    expect(data.catchups[biscuit]).toMatchObject({ start: "2026-11-20", end: "2026-12-01" })

    M.patchCatchup(data, biscuit, { end: "2026-12-15" }, now)
    M.patchCatchup(data, biscuit, { moveIn: "2026-11-22" }, now)
    expect(data.catchups[biscuit]).toMatchObject({ start: "2026-11-20", end: "2026-12-15" })

    M.patchCatchup(data, biscuit, { start: "2027-01-01" }, now)
    expect(data.catchups[biscuit]!.end).toBe("2027-01-01")
    expect(appDataSchema.safeParse(data).success).toBe(true)
  })
})

describe("recent amounts", () => {
  it("finds the latest entered amount per item, newest month first", () => {
    M.setLineAmount(data, line("Water").id, 3800, now)
    M.saveCurrent(data, now)
    M.startNewMonth(data, "2026-10", now)
    M.setLineAmount(data, line("Water").id, 4100, now)
    M.setLineAmount(data, line("Rent").id, 164800, now)
    expect(M.recentAmounts(data)).toMatchObject({ [item("Water").id]: 4100, [item("Rent").id]: 164800 })
    expect(M.recentAmounts(data)).not.toHaveProperty(item("Power").id)

    const filled = M.itemsWithRecentDefaults(data)
    expect(filled.find((t) => t.label === "Water")!.defaultAmountCents).toBe(4100)
    expect(filled.find((t) => t.label === "Power")!.defaultAmountCents).toBeUndefined()
  })
})

describe("residency and coverage", () => {
  it("puts move-in and move-out on the working month's participants", () => {
    M.setPersonResidency(data, biscuit, { from: "2026-09-16" })
    expect(data.current.participants).toEqual([
      { personId: biscuit, nickname: "Biscuit", from: "2026-09-16" },
    ])
    M.setPersonResidency(data, biscuit, { to: "2027-03-31" })
    expect(data.people[0]!.to).toBe("2027-03-31")
    M.setPersonResidency(data, biscuit, { from: null, to: null })
    expect(data.current.participants).toEqual([{ personId: biscuit, nickname: "Biscuit" }])
  })

  it("never lets a move-out precede a move-in", () => {
    M.setPersonResidency(data, biscuit, { from: "2026-09-16", to: "2026-09-01" })
    expect(data.people[0]).toMatchObject({ from: "2026-09-16", to: "2026-09-16" })
  })

  it("keeps the catch-up's move-in and the person's residency in step", () => {
    M.ensureCatchup(data, biscuit, "2026-09-01")
    M.setPersonResidency(data, biscuit, { from: "2026-09-16" })
    expect(data.catchups[biscuit]!.moveIn).toBe("2026-09-16")
    M.patchCatchup(data, biscuit, { moveIn: "2026-09-20" }, now)
    expect(data.people[0]!.from).toBe("2026-09-20")
  })

  it("gives every line the window its item covers", () => {
    // Defaults bill utilities a month in arrears; rent covers its own month.
    expect(line("Rent").covers).toEqual({ start: "2026-09-01", end: "2026-09-30" })
    expect(line("Water").covers).toEqual({ start: "2026-08-01", end: "2026-08-31" })
    expect(line("Rent").dueDate).toBe("2026-09-01")
  })

  it("carries an item's new coverage into the working month", () => {
    M.upsertItem(data, { ...item("Water"), coverage: { offsetMonths: 2, spanMonths: 1 }, dueDay: 22 })
    expect(line("Water").covers).toEqual({ start: "2026-07-01", end: "2026-07-31" })
    expect(line("Water").dueDate).toBe("2026-09-22")
  })

  it("lets one month's line override what it covers", () => {
    M.setLineCoverage(data, line("Sewer").id, { start: "2026-06-01", end: "2026-08-31" }, now)
    expect(line("Sewer").covers).toEqual({ start: "2026-06-01", end: "2026-08-31" })
    // A backwards window collapses rather than counting negative days.
    M.setLineCoverage(data, line("Sewer").id, { start: "2026-08-01", end: "2026-07-01" }, now)
    expect(line("Sewer").covers).toEqual({ start: "2026-08-01", end: "2026-08-01" })
  })

  it("remembers how a bill falls due, not just its day", () => {
    M.setLineDueDate(data, line("Power").id, "2026-09-18", now)
    expect(item("Power").due).toEqual({ offsetMonths: 0, day: 18 })

    // Sewer arrives in September for August, due the 1st of October. Next
    // month's statement has to put it on 1 November, not 1 October.
    M.setLineDueDate(data, line("Sewer").id, "2026-10-01", now)
    expect(item("Sewer").due).toEqual({ offsetMonths: 1, day: 1 })
    M.startNewMonth(data, "2026-10", now)
    expect(line("Sewer").dueDate).toBe("2026-11-01")
    expect(line("Sewer").covers).toEqual({ start: "2026-09-01", end: "2026-09-30" })

    M.setLineDueDate(data, line("Power").id, null, now)
    expect(item("Power").due).toBeUndefined()
    expect(line("Power").dueDate).toBeUndefined()
  })

  it("carries a due rule set in Setup into the working month", () => {
    M.upsertItem(data, { ...item("Sewer"), due: { offsetMonths: 1, day: 1 } })
    expect(line("Sewer").dueDate).toBe("2026-10-01")
    M.upsertItem(data, { ...item("Sewer"), due: undefined })
    expect(line("Sewer").dueDate).toBeUndefined()
  })

  it("still validates after all of it", () => {
    expect(appDataSchema.safeParse(data).success).toBe(true)
  })
})

describe("catch-up seeding", () => {
  it("starts from the residency already on record", () => {
    M.setPersonResidency(data, biscuit, { from: "2026-09-16" })
    M.ensureCatchup(data, biscuit, "2026-09-19")
    expect(data.catchups[biscuit]!.moveIn).toBe("2026-09-16")
  })

  it("falls back to today when there's no residency", () => {
    M.ensureCatchup(data, biscuit, "2026-09-19")
    expect(data.catchups[biscuit]!.moveIn).toBe("2026-09-19")
  })
})
