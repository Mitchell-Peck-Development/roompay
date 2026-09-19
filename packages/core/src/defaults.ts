import { type Period, defaultPeriod, formatPeriod } from "./dates"
import { newId } from "./ids"
import type {
  AppData,
  Cadence,
  ItemTemplate,
  MonthLine,
  MonthRecord,
} from "./schema"

export function defaultItems(): ItemTemplate[] {
  const item = (label: string, kind: ItemTemplate["kind"]): ItemTemplate => ({
    id: newId(),
    label,
    kind,
    enabled: true,
    split: { mode: "default" },
  })
  return [
    item("Rent", "fixed"),
    item("Service fee", "fixed"),
    item("Trash disposal", "fixed"),
    item("Sewer", "variable"),
    item("Water", "variable"),
    item("Power", "variable"),
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
  prevReading?: string
): MonthLine {
  const line: MonthLine = {
    id: newId(),
    templateId: template.id,
    label: template.label,
    kind: template.kind,
    amountCents:
      template.kind === "fixed" ? (template.defaultAmountCents ?? null) : null,
    split: structuredClone(template.split),
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
      .map((t) => lineFromTemplate(t, lastReading(history, t.id, period))),
    split: structuredClone(data.split),
    participants: data.people
      .filter((p) => !p.archived)
      .map((p) => ({ personId: p.id, nickname: p.nickname })),
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
