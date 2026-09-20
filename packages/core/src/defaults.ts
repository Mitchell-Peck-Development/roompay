import { coverageWindow, dueDateFor, normalizeDue } from "./coverage"
import { type Period, defaultPeriod, formatPeriod } from "./dates"
import { newId } from "./ids"
import type {
  AppData,
  Cadence,
  ItemTemplate,
  MonthLine,
  MonthRecord,
  Participant,
  Person,
} from "./schema"

export function defaultItems(): ItemTemplate[] {
  const item = (
    label: string,
    kind: ItemTemplate["kind"],
    extra: Partial<ItemTemplate> = {}
  ): ItemTemplate => ({
    id: newId(),
    label,
    kind,
    enabled: true,
    split: { mode: "default" },
    ...extra,
  })
  // Rent and fees are paid for the month ahead; metered utilities almost
  // always arrive a month in arrears. Both are editable per item in Setup.
  const rent = {
    coverage: { offsetMonths: 0, spanMonths: 1 },
    due: { offsetMonths: 0, day: 1 },
  }
  const arrears = { coverage: { offsetMonths: 1, spanMonths: 1 } }
  return [
    item("Rent", "fixed", rent),
    item("Service fee", "fixed", rent),
    item("Trash disposal", "fixed", rent),
    item("Sewer", "variable", arrears),
    item("Water", "variable", arrears),
    item("Power", "variable", arrears),
  ]
}

export function defaultCadences(): Cadence[] {
  return [
    { id: newId(), key: "full", name: "Pay in full", days: [1] },
    { id: newId(), key: "half", name: "Split in two", days: [1, 15] },
    { id: newId(), key: "weekly", name: "Weekly", days: [1, 8, 15, 22] },
  ]
}

export function lineFromTemplate(
  template: ItemTemplate,
  period: Period,
  prevReading?: string
): MonthLine {
  const dueDate = dueDateFor(period, normalizeDue(template))
  const line: MonthLine = {
    id: newId(),
    templateId: template.id,
    label: template.label,
    kind: template.kind,
    amountCents:
      template.kind === "fixed" ? (template.defaultAmountCents ?? null) : null,
    split: structuredClone(template.split),
    covers: coverageWindow(period, template.coverage),
    ...(dueDate ? { dueDate } : {}),
  }
  if (template.kind === "metered") {
    line.meter = {
      ...(template.meter ?? {
        unit: "unit",
        rate: "",
        baseFeeCents: 0,
        input: "usage" as const,
      }),
    }
    if (prevReading && line.meter.input === "readings") {
      line.meter.prev = prevReading
    }
  }
  return line
}

/** A person as a month snapshots them, residency included. */
export function toParticipant(person: Person): Participant {
  return {
    personId: person.id,
    nickname: person.nickname,
    ...(person.from ? { from: person.from } : {}),
    ...(person.to ? { to: person.to } : {}),
  }
}

/** The latest "current" reading recorded for a template, across all months. */
function lastReading(
  months: MonthRecord[],
  templateId: string,
  before: Period
): string | undefined {
  const sorted = months
    .filter((m) => m.period < before)
    .sort((a, b) => b.period.localeCompare(a.period))
  for (const month of sorted) {
    const curr = month.lines.find((l) => l.templateId === templateId)?.meter
      ?.curr
    if (curr) return curr
  }
  return undefined
}

export function newMonth(
  data: Pick<AppData, "items" | "people" | "split" | "months"> & {
    current?: MonthRecord
  },
  period: Period,
  now: Date
): MonthRecord {
  const history = data.current ? [...data.months, data.current] : data.months
  const stamp = now.toISOString()
  return {
    id: newId(),
    period,
    title: formatPeriod(period),
    lines: data.items
      .filter((t) => t.enabled)
      .map((t) => lineFromTemplate(t, period, lastReading(history, t.id, period))),
    split: structuredClone(data.split),
    participants: data.people.filter((p) => !p.archived).map(toParticipant),
    paid: {},
    published: {},
    createdAt: stamp,
    updatedAt: stamp,
  }
}

export function createInitialData(now: Date): AppData {
  const stamp = now.toISOString()
  const base = {
    items: defaultItems(),
    people: [],
    split: { mode: "even" as const },
    months: [],
  }
  return {
    version: 1,
    household: { label: "", currency: "USD" },
    ...base,
    cadences: defaultCadences(),
    current: newMonth(base, defaultPeriod(now), now),
    catchups: {},
    links: {},
    meta: { createdAt: stamp, updatedAt: stamp },
  }
}
