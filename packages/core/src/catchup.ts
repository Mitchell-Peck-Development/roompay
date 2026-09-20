import { coverageWindow } from "./coverage"
import {
  type ISODate,
  type Period,
  addDays,
  daysInMonth,
  diffDays,
  nextPeriod,
  periodOf,
} from "./dates"
import type { Cents } from "./money"
import { type Plan, scheduleEvenly } from "./plans"
import type {
  AppData,
  MonthRecord,
  CatchupRecord,
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
