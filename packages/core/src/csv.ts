import { computeCatchup } from "./catchup"
import { toISODate } from "./dates"
import { meterDetail } from "./meter"
import { type Cents, formatAmountInput } from "./money"
import { itemsWithRecentDefaults } from "./mutations"
import { paidTotal } from "./paid"
import type { AppData, MonthLine, MonthRecord } from "./schema"
import { OWNER, computeMonth } from "./split"

/**
 * History as a spreadsheet: one row per bill line, a Total row per month, and
 * a column per person. Amounts are plain numbers so they add up in a sheet.
 *
 * Each line also carries the service window it pays for and when it fell due,
 * as ISO dates — a sheet can sort and filter those, and they explain why a
 * share isn't a clean split when someone was only here for part of it.
 */

// A cell starting with one of these is treated as a formula by Excel and
// Sheets; a leading apostrophe keeps it as text.
const FORMULA_START = /^[=+@\t\r]/

export function csvCell(value: string): string {
  const text = FORMULA_START.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/** RFC 4180 rows, with the BOM that makes Excel read UTF-8 properly. */
export function toCsv(rows: string[][]): string {
  return "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n"
}

export function historyCsvFilename(now: Date): string {
  return `roompay-history-${toISODate(now)}.csv`
}

const amount = (cents: Cents | null | undefined): string =>
  cents === null || cents === undefined ? "" : formatAmountInput(cents)

function lineType(line: MonthLine): string {
  if (line.oneOff) return (line.amountCents ?? 0) < 0 ? "credit" : "one-time"
  return line.kind
}

/** Column headings after the fixed ones: share, received and shared per person. */
type Person = { id: string; label: string }

function personColumns(data: AppData, months: MonthRecord[]): Person[] {
  const labels = new Map<string, string>()
  for (const person of data.people) labels.set(person.id, person.nickname || "Roommate")
  for (const month of months) {
    for (const p of month.participants) {
      if (!labels.has(p.personId)) labels.set(p.personId, p.nickname || "Roommate")
    }
  }
  const used = new Set<string>()
  return [...labels].map(([id, name]) => {
    let label = name
    for (let n = 2; used.has(label); n++) label = `${name} (${n})`
    used.add(label)
    return { id, label }
  })
}

export function historyCsv(
  data: AppData,
  options: { catchups?: boolean } = {}
): string {
  const includeCatchups = options.catchups ?? true
  const months = [...data.months].sort((a, b) => a.period.localeCompare(b.period))
  const people = personColumns(data, months)
  const currency = data.household.currency

  const rows: string[][] = [
    [
      "Month",
      "Statement",
      "Row",
      "Item",
      "Type",
      "Detail",
      "Covers from",
      "Covers to",
      "Due",
      "Currency",
      "Bill",
      "You",
      ...people.flatMap((p) => [p.label, `${p.label} received`, `${p.label} shared on`]),
    ],
  ]

  /** One row: the per-person cells are given as share/received/shared triples. */
  const row = (
    period: string,
    statement: string,
    kind: string,
    item: string,
    type: string,
    detail: string,
    covers: [from: string, to: string],
    due: string,
    bill: string,
    owner: string,
    cells: Map<string, [share: string, received: string, sharedOn: string]>
  ) => [
    period,
    statement,
    kind,
    item,
    type,
    detail,
    ...covers,
    due,
    currency,
    bill,
    owner,
    ...people.flatMap((p) => cells.get(p.id) ?? ["", "", ""]),
  ]

  type Entry = { period: string; order: number; rows: string[][] }
  const entries: Entry[] = []

  for (const month of months) {
    const computed = computeMonth(month)
    const out: string[][] = []

    for (const line of computed.lines) {
      const shares = new Map<string, [string, string, string]>()
      for (const person of people) {
        const share = line.shares[person.id]
        shares.set(person.id, [line.entered ? amount(share ?? 0) : "", "", ""])
      }
      out.push(
        row(
          month.period,
          month.title,
          "Item",
          line.line.label,
          lineType(line.line),
          (line.line.kind === "metered" && line.line.meter
            ? meterDetail(line.line.meter, currency)
            : "") ?? "",
          [line.line.covers?.start ?? "", line.line.covers?.end ?? ""],
          line.line.dueDate ?? "",
          line.entered ? amount(line.amountCents) : "",
          line.entered ? amount(line.shares[OWNER] ?? 0) : "",
          shares
        )
      )
    }

    const totals = new Map<string, [string, string, string]>()
    for (const person of people) {
      const inMonth = month.participants.some((p) => p.personId === person.id)
      if (!inMonth) continue
      const published = month.published[person.id]
      totals.set(person.id, [
        amount(computed.totals[person.id] ?? 0),
        amount(paidTotal(month.paid[person.id] ?? [])),
        published ? published.at.slice(0, 10) : "",
      ])
    }
    out.push(
      row(
        month.period,
        month.title,
        "Total",
        "",
        "",
        "",
        ["", ""],
        "",
        amount(computed.totalCents),
        amount(computed.totals[OWNER] ?? 0),
        totals
      )
    )
    entries.push({ period: month.period, order: 0, rows: out })
  }

  if (includeCatchups) {
    const items = itemsWithRecentDefaults(data)
    for (const record of Object.values(data.catchups)) {
      const person = people.find((p) => p.id === record.personId)
      if (!person) continue
      const result = computeCatchup({ record, items, split: data.split, people: data.people })
      const period = record.moveIn.slice(0, 7)
      const title = "Move-in catch-up"
      const only = (share: Cents, received = "", sharedOn = "") =>
        new Map([[person.id, [amount(share), received, sharedOn] as [string, string, string]]])

      // Each item's share here is what they owe for it across the whole
      // catch-up, so these rows add up to the Total below.
      const out = result.lines.map((line) =>
        row(
          period,
          title,
          "Item",
          line.label,
          "estimate",
          "",
          ["", ""],
          "",
          amount(line.fullCents),
          "",
          only(line.shareCents)
        )
      )
      out.push(
        row(
          period,
          title,
          "Prorated",
          "",
          "",
          `${result.daysOccupied} of ${result.daysInMonth} days`,
          ["", ""],
          "",
          "",
          "",
          only(result.stubShareCents)
        )
      )
      if (result.nextMonthShareCents > 0) {
        out.push(
          row(period, title, "Next month", "", "", "", ["", ""], "", "", "", only(result.nextMonthShareCents))
        )
      }
      out.push(
        row(
          period,
          title,
          "Total",
          "",
          "",
          "",
          ["", ""],
          "",
          "",
          "",
          only(
            result.combinedCents,
            amount(paidTotal(record.paid)),
            record.published ? record.published.at.slice(0, 10) : ""
          )
        )
      )
      entries.push({ period, order: 1, rows: out })
    }
  }

  entries.sort((a, b) => a.period.localeCompare(b.period) || a.order - b.order)
  for (const entry of entries) rows.push(...entry.rows)

  return toCsv(rows)
}
