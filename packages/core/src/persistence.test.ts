import { beforeEach, describe, expect, it } from "vitest"
import { createInitialData } from "./defaults"
import * as M from "./mutations"
import { type AppData, appDataSchema } from "./schema"

const now = new Date(2026, 8, 19)

/** Exactly what the browser store does: JSON out, schema back in. */
const roundTrip = (data: AppData): AppData =>
  appDataSchema.parse(JSON.parse(JSON.stringify(data)))

/** Every field the app can write, on one document. */
function richData(): AppData {
  const data = createInitialData(now)
  data.household = { label: "Unit 3012", currency: "CAD" }

  const biscuit = M.addPerson(data, "Biscuit")
  M.setPersonResidency(data, biscuit, { from: "2026-09-14" })
  const gone = M.addPerson(data, "Moved out")
  M.setPersonResidency(data, gone, { from: "2025-01-01", to: "2026-08-31" })
  M.setPersonArchived(data, gone, true)

  const item = (label: string) => data.items.find((t) => t.label === label)!
  const line = (label: string) => data.current.lines.find((l) => l.label === label)!

  // A metered item, billed a month in arrears, due the month after that.
  M.upsertItem(data, {
    ...item("Power"),
    kind: "metered",
    coverage: { offsetMonths: 1, spanMonths: 1 },
    due: { offsetMonths: 1, day: 5 },
    meter: { unit: "kWh", rate: "0.13456", baseFeeCents: 1250, input: "readings" },
  })
  M.setLineMeter(data, line("Power").id, { prev: "10230.5", curr: "10611.25" }, now)
  M.setLineAmount(data, line("Rent").id, 164800, now)
  M.setLineSplit(data, line("Rent").id, { mode: "percent", pct: { [biscuit]: 40 } }, now)
  // One month's sewer bill covering a whole quarter.
  M.setLineCoverage(data, line("Sewer").id, { start: "2026-06-01", end: "2026-08-31" }, now)
  M.setLineAmount(data, line("Sewer").id, 11400, now)
  M.addOneOffLine(data, { label: "Plumber", amountCents: 24000 }, now)
  M.addOneOffLine(data, { label: "Groceries", amountCents: -4000, split: { mode: "exclude" } }, now)
  M.setMonthSplit(data, { mode: "percent", pct: { [biscuit]: 45.5 } }, now)
  M.setMonthTitle(data, "September — with the quarterly sewer", now)
  M.upsertCadence(data, { id: "c1", name: "Every payday", days: [3, 17] })

  M.saveCurrent(data, now)
  const monthId = data.current.id
  M.addPaid(data, { kind: "monthly", monthId }, biscuit, { amountCents: 25000, date: "2026-09-18" })
  M.setPublished(data, { kind: "monthly", monthId }, biscuit, {
    at: now.toISOString(),
    hash: "abc123",
    plans: [{ key: "half", payments: [{ date: "2026-09-01", amountCents: 25000 }, { date: "2026-09-15", amountCents: 26000 }] }],
  })
  M.ensureLink(data, biscuit, now)

  M.ensureCatchup(data, biscuit, "2026-09-14")
  M.patchCatchup(data, biscuit, { installments: 6, includeNextMonth: false, estimates: { [item("Rent").id]: 160000 } }, now)
  M.addPaid(data, { kind: "catchup" }, biscuit, { amountCents: 5000, date: "2026-09-19" })
  M.setPublished(data, { kind: "catchup" }, biscuit, { at: now.toISOString(), hash: "def456" })

  M.startNewMonth(data, "2026-10", now)
  data.meta.lastBackupAt = now.toISOString()
  data.meta.installNudgeDismissedAt = now.toISOString()
  data.meta.tipNudgeDismissedAt = now.toISOString()
  return data
}

describe("what the browser keeps", () => {
  it("survives a save and load with nothing dropped", () => {
    const data = richData()
    expect(roundTrip(data)).toEqual(data)
  })

  it("keeps every part of a bill: what it covers, when it's due, how it's split", () => {
    const data = richData()
    const saved = roundTrip(data)
    const september = saved.months.find((m) => m.period === "2026-09")!

    const sewer = september.lines.find((l) => l.label === "Sewer")!
    expect(sewer.covers).toEqual({ start: "2026-06-01", end: "2026-08-31" })
    const power = september.lines.find((l) => l.label === "Power")!
    expect(power.covers).toEqual({ start: "2026-08-01", end: "2026-08-31" })
    expect(power.dueDate).toBe("2026-10-05")
    expect(power.meter).toMatchObject({ prev: "10230.5", curr: "10611.25", rate: "0.13456" })

    const rent = september.lines.find((l) => l.label === "Rent")!
    expect(rent.split).toEqual({ mode: "percent", pct: { [saved.people[0]!.id]: 40 } })
    expect(september.title).toBe("September — with the quarterly sewer")
    expect(september.participants[0]).toMatchObject({ from: "2026-09-14" })
  })

  it("keeps the settings that new months are built from", () => {
    const saved = roundTrip(richData())
    const power = saved.items.find((t) => t.label === "Power")!
    expect(power.coverage).toEqual({ offsetMonths: 1, spanMonths: 1 })
    expect(power.due).toEqual({ offsetMonths: 1, day: 5 })
    expect(power.meter).toEqual({ unit: "kWh", rate: "0.13456", baseFeeCents: 1250, input: "readings" })
    expect(saved.cadences.at(-1)).toMatchObject({ name: "Every payday", days: [3, 17] })
    expect(saved.people[1]).toMatchObject({ archived: true, from: "2025-01-01", to: "2026-08-31" })
  })

  it("keeps what's been paid, published and shared", () => {
    const saved = roundTrip(richData())
    const person = saved.people[0]!.id
    const september = saved.months.find((m) => m.period === "2026-09")!
    expect(september.paid[person]).toMatchObject([{ amountCents: 25000, date: "2026-09-18" }])
    expect(september.published[person]).toMatchObject({
      hash: "abc123",
      plans: [{ key: "half", payments: [{ date: "2026-09-01", amountCents: 25000 }, { date: "2026-09-15", amountCents: 26000 }] }],
    })
    expect(saved.links[person]).toMatchObject({ token: expect.any(String), writeKey: expect.any(String) })
    expect(saved.catchups[person]).toMatchObject({
      installments: 6,
      includeNextMonth: false,
      paid: [{ amountCents: 5000 }],
      published: { hash: "def456" },
    })
  })

  it("a legacy document, written before coverage existed, still loads", () => {
    const data = richData()
    const legacy = JSON.parse(JSON.stringify(data))
    for (const item of legacy.items) {
      delete item.coverage
      delete item.due
      item.dueDay = 1
    }
    for (const month of [legacy.current, ...legacy.months]) {
      for (const line of month.lines) {
        delete line.covers
        delete line.dueDate
      }
      for (const p of month.participants) {
        delete p.from
        delete p.to
      }
    }
    const parsed = appDataSchema.safeParse(legacy)
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.items[0]!.dueDay).toBe(1)
  })
})

describe("editing an item in Setup", () => {
  let data: AppData
  const item = (label: string) => data.items.find((t) => t.label === label)!
  const line = (label: string) => data.current.lines.find((l) => l.label === label)!

  beforeEach(() => {
    data = createInitialData(now)
    M.addPerson(data, "Biscuit")
  })

  it("leaves a period this month's bill was given by hand", () => {
    // The sewer bill that turned up covering a whole quarter.
    M.setLineCoverage(data, line("Sewer").id, { start: "2026-06-01", end: "2026-08-31" }, now)
    M.setLineDueDate(data, line("Sewer").id, "2026-10-15", now)

    // Something unrelated changes about the item: a rename, a split, a switch.
    M.upsertItem(data, { ...item("Sewer"), label: "Sewer & drainage" })

    expect(line("Sewer & drainage").covers).toEqual({ start: "2026-06-01", end: "2026-08-31" })
    expect(line("Sewer & drainage").dueDate).toBe("2026-10-15")
  })

  it("still carries a changed billing period into a line that wasn't touched by hand", () => {
    M.upsertItem(data, { ...item("Water"), coverage: { offsetMonths: 2, spanMonths: 1 }, dueDay: 22 })
    expect(line("Water").covers).toEqual({ start: "2026-07-01", end: "2026-07-31" })
    expect(line("Water").dueDate).toBe("2026-09-22")
  })

  it("applies a changed billing period even when the line has an amount on it", () => {
    M.setLineAmount(data, line("Water").id, 3800, now)
    M.upsertItem(data, { ...item("Water"), coverage: { offsetMonths: 0, spanMonths: 1 } })
    expect(line("Water").covers).toEqual({ start: "2026-09-01", end: "2026-09-30" })
    expect(line("Water").amountCents).toBe(3800)
  })
})
