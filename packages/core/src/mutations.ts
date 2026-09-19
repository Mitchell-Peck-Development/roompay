import { defaultCatchupDates } from "./catchup"
import { coverageWindow, dueDateFor } from "./coverage"
import type { ISODate, Period } from "./dates"
import { lineFromTemplate, newMonth, toParticipant } from "./defaults"
import { newId, randomToken } from "./ids"
import { lineAmountCents } from "./meter"
import type {
  AppData,
  Cadence,
  CatchupRecord,
  ItemSplit,
  ItemTemplate,
  LineMeter,
  LinkSecrets,
  MonthLine,
  MonthRecord,
  PaidEntry,
  Published,
  ServiceWindow,
  Split,
} from "./schema"

/**
 * Every change to the owner's data, as plain functions over a mutable draft.
 * The app wraps these in its store; keeping them here keeps them testable.
 */

/** Where paid entries and published markers attach. */
export type StatementRef =
  | { kind: "monthly"; monthId: string }
  | { kind: "catchup" }

// ---------------------------------------------------------------- people ---

function syncParticipants(draft: AppData) {
  draft.current.participants = draft.people
    .filter((p) => !p.archived)
    .map(toParticipant)
}

export function addPerson(draft: AppData, nickname: string): string {
  const id = newId()
  draft.people.push({ id, nickname: nickname.trim() })
  syncParticipants(draft)
  return id
}

export function renamePerson(draft: AppData, id: string, nickname: string) {
  const person = draft.people.find((p) => p.id === id)
  if (!person) return
  person.nickname = nickname.trim()
  syncParticipants(draft)
}

/**
 * When someone moved in and, if they have, out. Shares of every bill are
 * weighted by this against the service window the bill covers, so an August
 * water bill billed in September skips a roommate who arrived in September.
 */
export function setPersonResidency(
  draft: AppData,
  id: string,
  patch: { from?: ISODate | null; to?: ISODate | null }
) {
  const person = draft.people.find((p) => p.id === id)
  if (!person) return
  for (const key of ["from", "to"] as const) {
    const value = patch[key]
    if (value === undefined) continue
    if (value === null) delete person[key]
    else person[key] = value
  }
  if (person.from && person.to && person.to < person.from) person.to = person.from
  // The catch-up tab works from the same move-in date; keep the two honest.
  const catchup = draft.catchups[id]
  if (catchup && person.from && catchup.moveIn !== person.from) {
    patchCatchup(draft, id, { moveIn: person.from })
  }
  syncParticipants(draft)
}

export function setPersonArchived(draft: AppData, id: string, archived: boolean) {
  const person = draft.people.find((p) => p.id === id)
  if (!person) return
  if (archived) person.archived = true
  else delete person.archived
  syncParticipants(draft)
}

/** Someone with history or a live link is archived, never deleted. */
export function canRemovePerson(data: AppData, id: string): boolean {
  if (data.links[id]) return false
  return !data.months.some((m) => m.participants.some((p) => p.personId === id))
}

export function removePerson(draft: AppData, id: string) {
  if (!canRemovePerson(draft, id)) return
  draft.people = draft.people.filter((p) => p.id !== id)
  delete draft.catchups[id]
  syncParticipants(draft)
}

// ----------------------------------------------------------------- items ---

function orderCurrentLines(draft: AppData) {
  const position = new Map(draft.items.map((t, i) => [t.id, i]))
  const rank = (line: MonthLine) =>
    line.templateId !== undefined && position.has(line.templateId)
      ? position.get(line.templateId)!
      : Number.MAX_SAFE_INTEGER
  // Array.prototype.sort is stable, so one-off lines keep their order.
  draft.current.lines.sort((a, b) => rank(a) - rank(b))
}

/**
 * Adds or replaces a line-item template and brings the working month along:
 * new items appear, edits apply (without touching what's been entered), and a
 * disabled item disappears unless it already has an amount this month.
 */
export function upsertItem(draft: AppData, item: ItemTemplate) {
  const index = draft.items.findIndex((t) => t.id === item.id)
  if (index === -1) draft.items.push(item)
  else draft.items[index] = item

  const lines = draft.current.lines
  const lineIndex = lines.findIndex((l) => l.templateId === item.id)
  const line = lines[lineIndex]

  if (!item.enabled) {
    if (line && lineAmountCents(line) === null) lines.splice(lineIndex, 1)
    return
  }
  if (!line) {
    lines.push(lineFromTemplate(item, draft.current.period))
    orderCurrentLines(draft)
    return
  }

  line.label = item.label
  line.split = structuredClone(item.split)
  line.covers = coverageWindow(draft.current.period, item.coverage)
  const dueDate = dueDateFor(draft.current.period, item.dueDay)
  if (dueDate) line.dueDate = dueDate
  else delete line.dueDate
  if (line.kind !== item.kind) {
    const fresh = lineFromTemplate(item, draft.current.period)
    line.kind = fresh.kind
    line.amountCents = fresh.amountCents
    line.meter = fresh.meter
  } else if (item.kind === "metered" && item.meter) {
    const switched = line.meter?.input !== item.meter.input
    line.meter = {
      ...(switched ? {} : line.meter),
      ...item.meter,
    }
  } else if (item.kind === "fixed" && line.amountCents === null) {
    line.amountCents = item.defaultAmountCents ?? null
  }
}

export function removeItem(draft: AppData, id: string) {
  draft.items = draft.items.filter((t) => t.id !== id)
  draft.current.lines = draft.current.lines.filter(
    (l) => l.templateId !== id || lineAmountCents(l) !== null
  )
}

export function moveItem(draft: AppData, id: string, delta: -1 | 1) {
  const from = draft.items.findIndex((t) => t.id === id)
  const to = from + delta
  if (from === -1 || to < 0 || to >= draft.items.length) return
  const [item] = draft.items.splice(from, 1)
  draft.items.splice(to, 0, item!)
  orderCurrentLines(draft)
}

// -------------------------------------------------------------- cadences ---

export function upsertCadence(
  draft: AppData,
  cadence: Omit<Cadence, "key"> & { key?: string }
) {
  const index = draft.cadences.findIndex((c) => c.id === cadence.id)
  const days = [...new Set(cadence.days)].sort((a, b) => a - b)
  if (index === -1) {
    // The key is what a roommate's pick refers to, so it's minted once.
    draft.cadences.push({ ...cadence, days, key: `c-${newId().slice(0, 8)}` })
  } else {
    draft.cadences[index] = { ...cadence, days, key: draft.cadences[index]!.key }
  }
}

export function removeCadence(draft: AppData, id: string) {
  if (draft.cadences.length <= 1) return
  draft.cadences = draft.cadences.filter((c) => c.id !== id)
}

// ----------------------------------------------------------- month lines ---

const findLine = (draft: AppData, lineId: string) =>
  draft.current.lines.find((l) => l.id === lineId)

function touchCurrent(draft: AppData, now: Date) {
  draft.current.updatedAt = now.toISOString()
}

export function setLineAmount(
  draft: AppData,
  lineId: string,
  amountCents: number | null,
  now = new Date()
) {
  const line = findLine(draft, lineId)
  if (!line) return
  line.amountCents = amountCents
  // A fixed charge is "usually the same", so next month starts from this one.
  if (line.kind === "fixed" && line.templateId && amountCents !== null) {
    const template = draft.items.find((t) => t.id === line.templateId)
    if (template) template.defaultAmountCents = amountCents
  }
  touchCurrent(draft, now)
}

export function setLineMeter(
  draft: AppData,
  lineId: string,
  patch: Partial<LineMeter>,
  now = new Date()
) {
  const line = findLine(draft, lineId)
  if (!line?.meter) return
  Object.assign(line.meter, patch)
  for (const key of ["usage", "prev", "curr"] as const) {
    if (line.meter[key] === "") delete line.meter[key]
  }
  // Rates drift; remember the latest so next month starts from it.
  const template = draft.items.find((t) => t.id === line.templateId)
  if (template?.meter) {
    if (patch.rate !== undefined) template.meter.rate = patch.rate
    if (patch.baseFeeCents !== undefined) template.meter.baseFeeCents = patch.baseFeeCents
  }
  touchCurrent(draft, now)
}

export function setLineSplit(
  draft: AppData,
  lineId: string,
  split: ItemSplit,
  now = new Date()
) {
  const line = findLine(draft, lineId)
  if (!line) return
  line.split = split
  touchCurrent(draft, now)
}

/**
 * Overrides what one month's line covers — for the quarter's worth of sewer,
 * or the bill that arrived a month late.
 */
export function setLineCoverage(
  draft: AppData,
  lineId: string,
  covers: ServiceWindow,
  now = new Date()
) {
  const line = findLine(draft, lineId)
  if (!line) return
  line.covers = covers.end < covers.start ? { ...covers, end: covers.start } : covers
  touchCurrent(draft, now)
}

export function setLineDueDate(
  draft: AppData,
  lineId: string,
  date: ISODate | null,
  now = new Date()
) {
  const line = findLine(draft, lineId)
  if (!line) return
  if (date) line.dueDate = date
  else delete line.dueDate
  // A bill that always lands on the same day starts there next month too.
  const template = draft.items.find((t) => t.id === line.templateId)
  if (template) {
    if (date) template.dueDay = Number(date.slice(8, 10))
    else delete template.dueDay
  }
  touchCurrent(draft, now)
}

export function addOneOffLine(
  draft: AppData,
  input: {
    label: string
    amountCents: number
    split?: ItemSplit
    covers?: ServiceWindow
    dueDate?: ISODate
  },
  now = new Date()
): string {
  const line: MonthLine = {
    id: newId(),
    label: input.label.trim(),
    kind: "variable",
    oneOff: true,
    amountCents: input.amountCents,
    split: input.split ?? { mode: "default" },
    covers: input.covers ?? coverageWindow(draft.current.period),
    ...(input.dueDate ? { dueDate: input.dueDate } : {}),
  }
  draft.current.lines.push(line)
  touchCurrent(draft, now)
  return line.id
}

export function removeLine(draft: AppData, lineId: string, now = new Date()) {
  draft.current.lines = draft.current.lines.filter((l) => l.id !== lineId)
  touchCurrent(draft, now)
}

export function setMonthSplit(draft: AppData, split: Split, now = new Date()) {
  draft.current.split = split
  touchCurrent(draft, now)
}

export function setMonthTitle(draft: AppData, title: string, now = new Date()) {
  draft.current.title = title
  touchCurrent(draft, now)
}

// ---------------------------------------------------------------- months ---

const content = (m: MonthRecord) =>
  JSON.stringify([m.period, m.title, m.lines, m.split, m.participants])

export function savedCopy(data: AppData): MonthRecord | undefined {
  return data.months.find((m) => m.id === data.current.id)
}

/** True when the working month has changes its saved copy doesn't. */
export function isDirty(data: AppData): boolean {
  const saved = savedCopy(data)
  return !saved || content(saved) !== content(data.current)
}

function sortMonths(draft: AppData) {
  draft.months.sort(
    (a, b) => b.period.localeCompare(a.period) || b.createdAt.localeCompare(a.createdAt)
  )
}

export function saveCurrent(draft: AppData, now = new Date()) {
  const stamp = now.toISOString()
  draft.current.savedAt = stamp
  draft.current.updatedAt = stamp
  const copy = structuredClone(draft.current)
  const index = draft.months.findIndex((m) => m.id === copy.id)
  if (index === -1) draft.months.push(copy)
  else draft.months[index] = copy
  sortMonths(draft)
}

export function openMonth(draft: AppData, id: string) {
  const saved = draft.months.find((m) => m.id === id)
  if (saved) draft.current = structuredClone(saved)
}

export function startNewMonth(draft: AppData, period: Period, now = new Date()) {
  draft.current = newMonth(draft, period, now)
}

export function deleteMonth(draft: AppData, id: string) {
  draft.months = draft.months.filter((m) => m.id !== id)
  if (draft.current.id === id) delete draft.current.savedAt
}

/** Applies a change to the working month and its saved copy alike. */
function eachCopy(draft: AppData, monthId: string, apply: (m: MonthRecord) => void) {
  if (draft.current.id === monthId) apply(draft.current)
  const saved = draft.months.find((m) => m.id === monthId)
  if (saved) apply(saved)
}

// ------------------------------------------------- paid + published state ---

export function addPaid(
  draft: AppData,
  ref: StatementRef,
  personId: string,
  entry: Omit<PaidEntry, "id">
) {
  const full: PaidEntry = { id: newId(), ...entry }
  if (ref.kind === "catchup") {
    draft.catchups[personId]?.paid.push(full)
    return
  }
  eachCopy(draft, ref.monthId, (m) => {
    ;(m.paid[personId] ??= []).push({ ...full })
  })
}

export function removePaid(
  draft: AppData,
  ref: StatementRef,
  personId: string,
  entryId: string
) {
  if (ref.kind === "catchup") {
    const record = draft.catchups[personId]
    if (record) record.paid = record.paid.filter((e) => e.id !== entryId)
    return
  }
  eachCopy(draft, ref.monthId, (m) => {
    m.paid[personId] = (m.paid[personId] ?? []).filter((e) => e.id !== entryId)
  })
}

export function setPublished(
  draft: AppData,
  ref: StatementRef,
  personId: string,
  published: Published | null
) {
  if (ref.kind === "catchup") {
    const record = draft.catchups[personId]
    if (!record) return
    if (published) record.published = published
    else delete record.published
    return
  }
  eachCopy(draft, ref.monthId, (m) => {
    if (published) m.published[personId] = published
    else delete m.published[personId]
  })
}

// ----------------------------------------------------------------- links ---

export function ensureLink(
  draft: AppData,
  personId: string,
  now = new Date()
): LinkSecrets {
  return (draft.links[personId] ??= {
    token: randomToken(),
    writeKey: randomToken(),
    createdAt: now.toISOString(),
  })
}

/** After a revoke (or a lost link): nothing is published any more. */
export function forgetLink(draft: AppData, personId: string) {
  delete draft.links[personId]
  delete draft.current.published[personId]
  for (const month of draft.months) delete month.published[personId]
  if (draft.catchups[personId]) delete draft.catchups[personId].published
}

// --------------------------------------------------------------- catch-up ---

export function ensureCatchup(
  draft: AppData,
  personId: string,
  today: ISODate
): CatchupRecord {
  const existing = draft.catchups[personId]
  if (existing) return existing
  // Residency set in Setup is the move-in date; only fall back to today when
  // there isn't one, so the two views never disagree the moment this opens.
  const moveIn = draft.people.find((p) => p.id === personId)?.from ?? today
  const record: CatchupRecord = {
    personId,
    moveIn,
    estimates: {},
    includeNextMonth: true,
    installments: 4,
    ...defaultCatchupDates(moveIn),
    paid: [],
  }
  draft.catchups[personId] = record
  return record
}

export function patchCatchup(
  draft: AppData,
  personId: string,
  patch: Partial<Omit<CatchupRecord, "personId" | "paid" | "published">>,
  now = new Date()
) {
  const record = draft.catchups[personId]
  if (!record) return
  const moved = patch.moveIn !== undefined && patch.moveIn !== record.moveIn
  // The schedule follows the move-in date until someone sets their own dates.
  const followsDefault =
    JSON.stringify({ start: record.start, end: record.end }) ===
    JSON.stringify(defaultCatchupDates(record.moveIn))
  Object.assign(record, patch)
  if (moved && followsDefault && patch.start === undefined && patch.end === undefined) {
    Object.assign(record, defaultCatchupDates(record.moveIn))
  }
  if (record.end < record.start) record.end = record.start
  record.updatedAt = now.toISOString()
  // A move-in date is residency, and residency is what prorates every split.
  const person = draft.people.find((p) => p.id === personId)
  if (person && person.from !== record.moveIn) {
    person.from = record.moveIn
    syncParticipants(draft)
  }
}

// ------------------------------------------------------------ estimates ---

/**
 * The most recent amount entered for each line item, across the working month
 * and saved months — a sensible starting estimate for a move-in catch-up.
 */
export function recentAmounts(data: Pick<AppData, "current" | "months">): Record<string, number> {
  const months = [data.current, ...data.months].sort(
    (a, b) => b.period.localeCompare(a.period) || b.updatedAt.localeCompare(a.updatedAt)
  )
  const found: Record<string, number> = {}
  for (const month of months) {
    for (const line of month.lines) {
      if (!line.templateId || line.templateId in found) continue
      const amount = lineAmountCents(line)
      if (amount !== null) found[line.templateId] = amount
    }
  }
  return found
}

/** Item templates with each missing default filled in from recent months. */
export function itemsWithRecentDefaults(data: Pick<AppData, "items" | "current" | "months">): ItemTemplate[] {
  const recent = recentAmounts(data)
  return data.items.map((item) =>
    item.defaultAmountCents === undefined && recent[item.id] !== undefined
      ? { ...item, defaultAmountCents: recent[item.id] }
      : item
  )
}
