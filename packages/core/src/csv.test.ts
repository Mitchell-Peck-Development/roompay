import { beforeEach, describe, expect, it } from "vitest"
import { csvCell, historyCsv, historyCsvFilename, toCsv } from "./csv"
import { createInitialData } from "./defaults"
import * as M from "./mutations"
import type { AppData } from "./schema"

const now = new Date(2026, 8, 19)

describe("csv basics", () => {
  it("quotes only what needs it", () => {
    expect(csvCell("Rent")).toBe("Rent")
    expect(csvCell("Rent, water")).toBe('"Rent, water"')
    expect(csvCell('He said "hi"')).toBe('"He said ""hi"""')
    expect(csvCell("two\nlines")).toBe('"two\nlines"')
    expect(csvCell("")).toBe("")
  })

  it("defuses anything a spreadsheet would run as a formula", () => {
    expect(csvCell("=1+1")).toBe("'=1+1")
    expect(csvCell("+cmd")).toBe("'+cmd")
    expect(csvCell("@sum")).toBe("'@sum")
    // Negative amounts are numbers, not formulas.
    expect(csvCell("-40.00")).toBe("-40.00")
  })

  it("writes CRLF rows with a BOM so Excel reads UTF-8", () => {
    const csv = toCsv([
      ["a", "b"],
      ["1", "2"],
    ])
    expect(csv).toBe("\uFEFFa,b\r\n1,2\r\n")
  })
})

describe("historyCsv", () => {
  let data: AppData
  let biscuit: string
  /** Minimal RFC 4180 reader, so quoted cells come back whole. */
  const parse = (csv: string): string[][] =>
    csv
      .replace(/^\uFEFF/, "")
      .trim()
      .split("\r\n")
      .map((line) => {
        const cells: string[] = []
        let cell = ""
        let quoted = false
        for (let i = 0; i < line.length; i++) {
          const char = line[i]!
          if (quoted) {
            if (char !== '"') {
              cell += char
            } else if (line[i + 1] === '"') {
              cell += '"'
              i++
            } else {
              quoted = false
            }
          } else if (char === '"') {
            quoted = true
          } else if (char === ",") {
            cells.push(cell)
            cell = ""
          } else {
            cell += char
          }
        }
        cells.push(cell)
        return cells
      })

  const rows = () => parse(historyCsv(data))
  const find = (label: string) => rows().slice(1).find((r) => r[3] === label)!

  beforeEach(() => {
    data = createInitialData(now)
    biscuit = M.addPerson(data, "Biscuit")
    const line = (label: string) => data.current.lines.find((l) => l.label === label)!
    M.setLineAmount(data, line("Rent").id, 164800, now)
    M.setLineAmount(data, line("Power").id, 16000, now)
    M.saveCurrent(data, now)
  })

  it("heads with one column per person", () => {
    expect(rows()[0]).toEqual([
      "Month", "Statement", "Row", "Item", "Type", "Detail", "Currency", "Bill",
      "You", "Biscuit", "Biscuit received", "Biscuit shared on",
    ])
  })

  it("writes a row per line in bill order, then the month's total", () => {
    const body = rows().slice(1)
    expect(body.map((r) => r[3])).toEqual([
      "Rent", "Service fee", "Trash disposal", "Sewer", "Water", "Power", "",
    ])
    expect(body[0]).toEqual([
      "2026-09", "September 2026", "Item", "Rent", "fixed", "", "USD", "1648.00", "824.00", "824.00", "", "",
    ])
    expect(find("Power").slice(2, 10)).toEqual([
      "Item", "Power", "variable", "", "USD", "160.00", "80.00", "80.00",
    ])
    expect(body.at(-1)).toEqual([
      "2026-09", "September 2026", "Total", "", "", "", "USD", "1808.00", "904.00", "904.00", "0.00", "",
    ])
  })

  it("leaves a line that was never filled in blank, rather than zero", () => {
    expect(find("Water").slice(7, 10)).toEqual(["", "", ""])
  })

  it("shows metered working, one-time items and credits", () => {
    M.upsertItem(data, {
      id: "gas",
      label: "Gas",
      kind: "metered",
      enabled: true,
      split: { mode: "default" },
      meter: { unit: "therm", rate: "1.2345", baseFeeCents: 0, input: "usage" },
    })
    const gas = data.current.lines.find((l) => l.templateId === "gas")!
    M.setLineMeter(data, gas.id, { usage: "23.4" }, now)
    M.addOneOffLine(data, { label: "Groceries, split", amountCents: -4000 }, now)
    M.saveCurrent(data, now)

    expect(find("Gas").slice(4, 8)).toEqual(["metered", "23.4 therm × $1.2345", "USD", "28.89"])
    expect(find("Groceries, split").slice(4, 10)).toEqual(["credit", "", "USD", "-40.00", "-20.00", "-20.00"])
    // The comma in that label survives a round trip through the file.
    expect(historyCsv(data)).toContain('"Groceries, split"')
  })

  it("records what's been received and where it was shared", () => {
    const monthId = data.current.id
    M.addPaid(data, { kind: "monthly", monthId }, biscuit, { amountCents: 25000, date: "2026-09-19" })
    M.setPublished(data, { kind: "monthly", monthId }, biscuit, {
      at: "2026-09-19T15:04:05.000Z",
      hash: "h",
    })
    const total = rows().at(-1)!
    expect(total.slice(9)).toEqual(["904.00", "250.00", "2026-09-19"])
  })

  it("includes a move-in catch-up, prorated and all", () => {
    M.ensureCatchup(data, biscuit, "2026-09-14")
    M.patchCatchup(data, biscuit, { installments: 4 }, now)
    const catchup = rows()
      .slice(1)
      .filter((r) => r[1] === "Move-in catch-up")
    // A full month's estimates (fixed defaults and the most recent amounts),
    // then the prorated stub, the next full month, and the combined total.
    expect(catchup.map((r) => r[2])).toEqual([
      "Item", "Item", "Item", "Item", "Item", "Item", "Prorated", "Next month", "Total",
    ])
    expect(catchup[0]!.slice(3, 10)).toEqual(["Rent", "estimate", "", "USD", "1648.00", "", "824.00"])
    const at = (kind: string) => catchup.find((r) => r[2] === kind)!
    expect(at("Prorated")[5]).toBe("17 of 30 days")
    // 904.00 × 17/30 = 512.27, plus the next full month.
    expect(at("Prorated")[9]).toBe("512.27")
    expect(at("Next month")[9]).toBe("904.00")
    expect(at("Total")[9]).toBe("1416.27")
  })

  it("runs oldest month first and can leave catch-ups out", () => {
    M.startNewMonth(data, "2026-10", now)
    M.saveCurrent(data, now)
    M.ensureCatchup(data, biscuit, "2026-09-14")
    expect([...new Set(rows().slice(1).map((r) => r[0]))]).toEqual(["2026-09", "2026-10"])

    const months = historyCsv(data, { catchups: false })
    expect(months).not.toContain("Move-in catch-up")
    expect(historyCsv(data)).toContain("Move-in catch-up")
  })

  it("exports just a header when nothing is saved", () => {
    const fresh = createInitialData(now)
    expect(historyCsv(fresh).replace(/^\uFEFF/, "").trim().split("\r\n")).toHaveLength(1)
    expect(historyCsvFilename(now)).toBe("roompay-history-2026-09-19.csv")
  })
})
