import {
  type ISODate,
  addDays,
  daysInMonth,
  diffDays,
  nextPeriod,
  periodOf,
} from "./dates"
import type { Cents } from "./money"
import { type Plan, scheduleEvenly } from "./plans"
import type {
  CatchupRecord,
  ItemTemplate,
  MonthLine,
  Person,
  Split,
} from "./schema"
import { computeMonth } from "./split"

export type CatchupLine = {
  templateId: string
  label: string
  fullCents: Cents
  shareCents: Cents
}

export type CatchupResult = {
  lines: CatchupLine[]
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

/** First payment on move-in day, caught up by the 1st of the next month. */
export function defaultCatchupDates(moveIn: ISODate): {
  start: ISODate
  end: ISODate
} {
  return { start: moveIn, end: `${nextPeriod(periodOf(moveIn))}-01` }
}

/**
 * A partial first month is prorated by days occupied, optionally joined with
 * the following full month, and the combined amount is spread over evenly
 * spaced installments so nothing lands as one oversized payment.
 */
export function computeCatchup(input: {
  record: CatchupRecord
  items: ItemTemplate[]
  split: Split
  people: Person[]
}): CatchupResult {
  const { record, items, split, people } = input
  const participants = people
    .filter((p) => !p.archived || p.id === record.personId)
    .map((p) => ({ personId: p.id, nickname: p.nickname }))

  const enabled = items.filter((t) => t.enabled)
  const synthetic: MonthLine[] = enabled.map((t) => ({
    id: t.id,
    templateId: t.id,
    label: t.label,
    kind: "fixed",
    amountCents: record.estimates[t.id] ?? t.defaultAmountCents ?? 0,
    split: t.split,
  }))
  const month = computeMonth({ lines: synthetic, split, participants })

  const lines = month.lines.map((l) => ({
    templateId: l.line.id,
    label: l.line.label,
    fullCents: l.amountCents,
    shareCents: l.shares[record.personId] ?? 0,
  }))
  const fullShareCents = month.totals[record.personId] ?? 0

  const period = periodOf(record.moveIn)
  const dim = daysInMonth(period)
  const moveInDay = Number(record.moveIn.slice(8, 10))
  const daysOccupied = dim - moveInDay + 1
  const stubShareCents = Math.round((fullShareCents * daysOccupied) / dim)
  const nextMonthShareCents = record.includeNextMonth ? fullShareCents : 0
  const combinedCents = stubShareCents + nextMonthShareCents

  const n = Math.max(1, Math.trunc(record.installments))
  const span = Math.max(0, diffDays(record.start, record.end))
  const dates = Array.from({ length: n }, (_, i) =>
    addDays(record.start, n === 1 ? 0 : Math.round((i * span) / (n - 1)))
  )

  return {
    lines,
    fullMonthTotalCents: month.totalCents,
    fullShareCents,
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
