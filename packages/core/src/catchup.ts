import { coverageWindow, normalizeCoverage } from "./coverage"
import {
  type ISODate,
  type Period,
  addDays,
  dateInPeriod,
  daysInMonth,
  diffDays,
  formatShortDate,
  nextPeriod,
  ordinal,
  periodOf,
  prevPeriod,
  shiftPeriod,
} from "./dates"
import type { Cents } from "./money"
import { type Plan, scheduleEvenly } from "./plans"
import type {
  AppData,
  Cadence,
  MonthRecord,
  CatchupRecord,
  CatchupTabPref,
  ItemTemplate,
  MonthLine,
  Participant,
  Person,
  ServiceWindow,
  Split,
} from "./schema"
import { computeMonth } from "./split"

export type CatchupLine = {
  templateId: string
  label: string
  /** What the item costs in a full month, before anything is prorated. */
  fullCents: Cents
  /** What they owe for it across the whole catch-up. */
  shareCents: Cents
}

export type CatchupStatementLine = CatchupLine & {
  covers: ServiceWindow
  /** 0–1: how much of that window they were here for. */
  occupancy: number
}

/** One month's worth of the catch-up, as the monthly statement will bill it. */
export type CatchupStatement = {
  period: Period
  lines: CatchupStatementLine[]
  shareCents: Cents
  /** True while this is still a guess — no month saved for it yet. */
  estimated: boolean
}

export type CatchupResult = {
  lines: CatchupLine[]
  statements: CatchupStatement[]
  /** The reference full month, item by item: its cost and their share of it. */
  fullMonthLines: CatchupLine[]
  fullMonthTotalCents: Cents
  fullShareCents: Cents
  daysOccupied: number
  daysInMonth: number
  stubShareCents: Cents
  nextMonthShareCents: Cents
  combinedCents: Cents
  plan: Plan
}

export const CATCHUP_PLAN_KEY = "catchup"

/**
 * The months a catch-up settles. While it's open these are billed through the
 * catch-up alone, so a roommate is never asked for the same month twice.
 */
export function catchupPeriods(record: CatchupRecord): Period[] {
  const first = periodOf(record.moveIn)
  return record.includeNextMonth ? [first, nextPeriod(first)] : [first]
}

/** Whether this person's share of `period` belongs to an open catch-up. */
export function coveredByCatchup(
  data: Pick<AppData, "catchups">,
  personId: string,
  period: Period
): boolean {
  const record = data.catchups[personId]
  if (!record || record.closedAt) return false
  return catchupPeriods(record).includes(period)
}

/** First payment on move-in day, caught up by the 1st of the next month. */
export function defaultCatchupDates(moveIn: ISODate): {
  start: ISODate
  end: ISODate
} {
  return { start: moveIn, end: `${nextPeriod(periodOf(moveIn))}-01` }
}

/** A catch-up as it starts out, before anything is filled in. */
export function newCatchupRecord(
  personId: string,
  moveIn: ISODate
): CatchupRecord {
  return {
    personId,
    moveIn,
    estimates: {},
    includeNextMonth: true,
    installments: 4,
    ...defaultCatchupDates(moveIn),
    paid: [],
  }
}

/** A month's bills as they'd be billed, with each item's service window. */
function syntheticLines(
  period: Period,
  items: ItemTemplate[],
  estimates: Record<string, Cents>,
  covered: boolean
): MonthLine[] {
  return items.map((t) => ({
    id: t.id,
    templateId: t.id,
    label: t.label,
    kind: "fixed",
    amountCents: estimates[t.id] ?? t.defaultAmountCents ?? 0,
    split: t.split,
    ...(covered ? { covers: coverageWindow(period, t.coverage) } : {}),
  }))
}

/**
 * What a roommate owes for their first months. Each item is billed against
 * the service it pays for, not the month the statement lands in — so a water
 * bill a month in arrears skips their first statement and only shows up,
 * prorated, on the next one. The total is then spread over evenly spaced
 * installments so nothing arrives as one oversized payment.
 */
export function computeCatchup(input: {
  record: CatchupRecord
  items: ItemTemplate[]
  split: Split
  people: Person[]
  /** Saved months. Any month that's been saved bills for real, not by guess. */
  months?: MonthRecord[]
}): CatchupResult {
  const { record, items, split, people, months = [] } = input
  const enabled = items.filter((t) => t.enabled)

  const participants: Participant[] = people
    .filter((p) => !p.archived || p.id === record.personId)
    .map((p) =>
      p.id === record.personId
        ? { personId: p.id, nickname: p.nickname, from: record.moveIn, ...(p.to ? { to: p.to } : {}) }
        : { personId: p.id, nickname: p.nickname, ...(p.from ? { from: p.from } : {}), ...(p.to ? { to: p.to } : {}) }
    )
  // A "typical full month": the same bills with nobody's residency applied.
  const wholeMonth = participants.map(({ personId, nickname }) => ({
    personId,
    nickname,
  }))

  const period = periodOf(record.moveIn)
  const periods = record.includeNextMonth ? [period, nextPeriod(period)] : [period]

  const reference = computeMonth({
    lines: syntheticLines(period, enabled, record.estimates, false),
    split,
    participants: wholeMonth,
  })

  const statements = periods.map((p): CatchupStatement => {
    // Once a month is saved it bills for real; until then it's an estimate.
    const saved = months.find((m) => m.period === p)
    const month = saved
      ? computeMonth(saved)
      : computeMonth({
          lines: syntheticLines(p, enabled, record.estimates, true),
          split,
          participants,
        })
    return {
      period: p,
      estimated: !saved,
      lines: month.lines.map((l) => ({
        templateId: l.line.templateId ?? l.line.id,
        label: l.line.label,
        fullCents: l.amountCents,
        shareCents: l.shares[record.personId] ?? 0,
        covers: l.line.covers ?? coverageWindow(p),
        occupancy: l.occupancy[record.personId] ?? 1,
      })),
      shareCents: month.totals[record.personId] ?? 0,
    }
  })

  // One row per item, totalled across every statement in the catch-up.
  const merged = new Map<string, CatchupLine>()
  for (const statement of statements) {
    for (const line of statement.lines) {
      const row = merged.get(line.templateId)
      if (row) row.shareCents += line.shareCents
      else
        merged.set(line.templateId, {
          templateId: line.templateId,
          label: line.label,
          fullCents: line.fullCents,
          shareCents: line.shareCents,
        })
    }
  }

  const dim = daysInMonth(period)
  const moveInDay = Number(record.moveIn.slice(8, 10))
  const daysOccupied = dim - moveInDay + 1
  const stubShareCents = statements[0]?.shareCents ?? 0
  const nextMonthShareCents = statements[1]?.shareCents ?? 0
  const combinedCents = stubShareCents + nextMonthShareCents

  const n = Math.max(1, Math.trunc(record.installments))
  const span = Math.max(0, diffDays(record.start, record.end))
  const dates = Array.from({ length: n }, (_, i) =>
    addDays(record.start, n === 1 ? 0 : Math.round((i * span) / (n - 1)))
  )

  return {
    lines: [...merged.values()],
    statements,
    fullMonthLines: reference.lines.map((l) => ({
      templateId: l.line.templateId ?? l.line.id,
      label: l.line.label,
      fullCents: l.amountCents,
      shareCents: l.shares[record.personId] ?? 0,
    })),
    fullMonthTotalCents: reference.totalCents,
    fullShareCents: reference.totals[record.personId] ?? 0,
    daysOccupied,
    daysInMonth: dim,
    stubShareCents,
    nextMonthShareCents,
    combinedCents,
    plan: {
      key: CATCHUP_PLAN_KEY,
      name: "Catch-up plan",
      payments: scheduleEvenly(combinedCents, dates),
    },
  }
}

/** Every date from `start` to `end` inclusive that falls on one of `days`, clamped like monthly dates. */
function datesOnDays(days: number[], start: ISODate, end: ISODate): ISODate[] {
  const dates = new Set<ISODate>()
  for (let period = periodOf(start); period <= periodOf(end); period = nextPeriod(period)) {
    for (const day of days) {
      const date = dateInPeriod(period, day)
      if (date >= start && date <= end) dates.add(date)
    }
  }
  return [...dates].sort()
}

function describeDays(days: number[]): string {
  const list = [...new Set(days)].sort((a, b) => a - b).map(ordinal)
  const joined = list.length === 1 ? list[0]! : `${list.slice(0, -1).join(", ")} and ${list.at(-1)}`
  return `On the ${joined}, like every month.`
}

/**
 * The schedules a roommate can pick from for their catch-up: the owner's installments first — the
 * default — then each of the household's usual schedules, on whichever of its days fall between the
 * first payment and the caught-up-by date. They keep the monthly plans' keys and names, so a pick
 * here carries on into the months after. A schedule with no day in that window isn't offered, and
 * one landing on exactly the same dates as an earlier one is left out.
 */
export function catchupPlans(args: {
  result: CatchupResult
  record: CatchupRecord
  cadences: Cadence[]
}): Plan[] {
  const { result, record, cadences } = args
  const owner: Plan = {
    ...result.plan,
    description: `Evenly spaced from ${formatShortDate(record.start)} to ${formatShortDate(record.end)}.`,
  }
  const plans = [owner]
  const seen = new Set([owner.payments.map((p) => p.date).join()])
  for (const cadence of cadences) {
    const dates = datesOnDays(cadence.days, record.start, record.end)
    const id = dates.join()
    if (dates.length === 0 || seen.has(id)) continue
    seen.add(id)
    plans.push({
      key: cadence.key,
      name: cadence.name,
      description: describeDays(cadence.days),
      payments: scheduleEvenly(result.combinedCents, dates),
    })
  }
  // As many as a share link holds.
  return plans.slice(0, 12)
}

/**
 * The largest number of months any enabled item bills in arrears. Offset
 * bills keep looking backwards, so a roommate's statements stay prorated for
 * this many months after they move in.
 */
export function maxOffsetMonths(items: ItemTemplate[]): number {
  return items
    .filter((t) => t.enabled)
    .reduce((max, t) => Math.max(max, t.coverage?.offsetMonths ?? 0), 0)
}

/**
 * The stretch of months a catch-up has anything to say about:
 *
 * - the month before the move-in, so it can be set up ahead of time;
 * - the months it bills — the part-month and, if included, the next one;
 * - the months whose statements pay for those, since a bill in arrears for
 *   the move-in month doesn't land until later;
 * - and, while it's still open, however long its installments run.
 */
export function catchupSpan(
  record: CatchupRecord,
  items: ItemTemplate[]
): { from: Period; to: Period } {
  const periods = catchupPeriods(record)
  const first = periods[0] ?? periodOf(record.moveIn)
  const last = periods[periods.length - 1] ?? first

  let to = last
  for (const item of items) {
    if (!item.enabled) continue
    const { offsetMonths, spanMonths } = normalizeCoverage(item.coverage)
    // A bill landing in P covers [P - offset - span + 1, P - offset], so the
    // ones paying for `last` land in the months up to last + offset + span - 1.
    const landed = shiftPeriod(last, offsetMonths + spanMonths - 1)
    if (landed > to) to = landed
  }
  // An open catch-up is still being paid off, however long that takes.
  if (!record.closedAt) {
    const end = periodOf(record.end)
    if (end > to) to = end
  }
  return { from: prevPeriod(first), to }
}

/**
 * Whether anyone in the household is still settling in as of `period` —
 * moving in, about to, or waiting on the bills that cover their first months.
 * Someone with no move-in date has always been here, so never counts.
 */
export function isCatchingUp(
  data: Pick<AppData, "people" | "items" | "catchups">,
  period: Period
): boolean {
  return data.people.some((person) => {
    if (person.archived) return false
    const record =
      data.catchups[person.id] ??
      (person.from ? newCatchupRecord(person.id, person.from) : undefined)
    if (!record) return false
    const { from, to } = catchupSpan(record, data.items)
    return period >= from && period <= to
  })
}

/** Whether the Catch-up tab is shown, honouring the override from Setup. */
export function showCatchupTab(
  data: Pick<AppData, "people" | "items" | "catchups" | "prefs">,
  period: Period
): boolean {
  const pref: CatchupTabPref = data.prefs?.catchupTab ?? "auto"
  if (pref !== "auto") return pref === "on"
  return isCatchingUp(data, period)
}
