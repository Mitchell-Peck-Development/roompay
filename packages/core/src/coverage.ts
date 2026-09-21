import {
  type ISODate,
  type Period,
  addDays,
  dateInPeriod,
  diffDays,
  firstOfPeriod,
  formatPeriod,
  formatShortDate,
  lastOfPeriod,
  nextPeriod,
  ordinal,
  periodOf,
  prevPeriod,
  shiftPeriod,
} from "./dates"
import type { Coverage, DueRule, ItemTemplate, Person, ServiceWindow } from "./schema"

/**
 * Bills rarely cover the month they land in. The water and sewer statement
 * that turns up at the end of September is August's usage, so whoever lived
 * here in August owes it — not whoever happens to be on September's split.
 *
 * Every line therefore carries the window of service it pays for, and shares
 * are weighted by how much of that window each roommate was actually here.
 * One mechanism covers offset bills, mid-month move-ins and move-outs alike.
 */

/** Covers the month it's billed in — what a bill does unless told otherwise. */
export const SAME_MONTH: Coverage = { offsetMonths: 0, spanMonths: 1 }

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.trunc(n)))

export function normalizeCoverage(coverage?: Coverage): Coverage {
  if (!coverage) return SAME_MONTH
  const normalized: Coverage = {
    offsetMonths: clamp(coverage.offsetMonths, 0, 24),
    spanMonths: clamp(coverage.spanMonths, 1, 12),
  }
  // The 1st *is* whole calendar months, so it's stored as the plain form.
  const startDay = coverage.startDay ? clamp(coverage.startDay, 1, 31) : 1
  if (startDay > 1) normalized.startDay = startDay
  return normalized
}

/**
 * The service window a bill on `period`'s statement pays for.
 *
 * With a cycle day the window runs from that day to the day before it, so
 * consecutive bills meet exactly: a meter read on the 28th gives 28 Aug – 27
 * Sep, and the next bill picks up on the 28th. Day 31 lands on the last day
 * of a short month, and the following window still starts the day after.
 */
export function coverageWindow(
  period: Period,
  coverage?: Coverage
): ServiceWindow {
  const { offsetMonths, spanMonths, startDay } = normalizeCoverage(coverage)
  const last = shiftPeriod(period, -offsetMonths)
  const first = shiftPeriod(last, -(spanMonths - 1))
  if (!startDay) {
    return { start: firstOfPeriod(first), end: lastOfPeriod(last) }
  }
  return {
    start: dateInPeriod(first, startDay),
    end: addDays(dateInPeriod(nextPeriod(last), startDay), -1),
  }
}

/**
 * An item's due rule, tolerating the day-only form written before due dates
 * could fall outside the month they're billed in.
 */
export function normalizeDue(
  item: Pick<ItemTemplate, "due" | "dueDay">
): DueRule | undefined {
  if (item.due) {
    return {
      offsetMonths: clamp(item.due.offsetMonths, -2, 12),
      day: clamp(item.due.day, 1, 31),
    }
  }
  if (item.dueDay === undefined || !Number.isFinite(item.dueDay)) return undefined
  return { offsetMonths: 0, day: clamp(item.dueDay, 1, 31) }
}

/**
 * When a bill on `period`'s statement falls due. The offset is what lets a
 * bill you receive in September be due on the 1st of October; the day is
 * clamped into whatever month that lands in (31 → 28 in February).
 */
export function dueDateFor(period: Period, due?: DueRule): ISODate | undefined {
  if (!due) return undefined
  return dateInPeriod(shiftPeriod(period, due.offsetMonths), due.day)
}

/** The rule a concrete due date implies for bills on `period`'s statement. */
export function dueRuleFrom(period: Period, date: ISODate): DueRule {
  return {
    offsetMonths: clamp(monthsBetween(period, periodOf(date)), -2, 12),
    day: Number(date.slice(8, 10)),
  }
}

/** True when a bill isn't due in the month it's billed in. */
export function isDueLater(due?: DueRule): boolean {
  return (due?.offsetMonths ?? 0) !== 0
}

/** "Due the 1st of the following month." */
export function describeDue(due?: DueRule): string {
  if (!due) return "No due date — it won't sit on the Bills calendar."
  const day = `the ${ordinal(due.day)}`
  switch (due.offsetMonths) {
    case 0:
      return `Due ${day} of the month it's billed in.`
    case 1:
      return `Due ${day} of the following month.`
    case -1:
      return `Due ${day} of the month before.`
    default:
      return due.offsetMonths > 0
        ? `Due ${day}, ${due.offsetMonths} months after it's billed.`
        : `Due ${day}, ${-due.offsetMonths} months before it's billed.`
  }
}

/**
 * The coverage a concrete window came from, as far as it can be read back —
 * which is what turns a window set by hand on one month into a rule every
 * month can follow. Whatever it proposes has to rebuild the same window, so
 * anything that doesn't repeat cleanly (a one-off stretch, an odd number of
 * days) comes back null rather than as a rule that would drift.
 */
export function coverageOf(
  period: Period,
  window: ServiceWindow
): Coverage | null {
  const first = periodOf(window.start)
  const wholeMonths = isWholeMonths(window)
  const last = wholeMonths ? periodOf(window.end) : prevPeriod(periodOf(addDays(window.end, 1)))
  const candidate: Coverage = {
    offsetMonths: monthsBetween(last, period),
    spanMonths: monthsBetween(first, last) + 1,
  }
  if (!wholeMonths) candidate.startDay = Number(window.start.slice(8, 10))
  if (candidate.offsetMonths < 0 || candidate.spanMonths < 1) return null

  const rebuilt = coverageWindow(period, candidate)
  if (rebuilt.start !== window.start || rebuilt.end !== window.end) return null
  return normalizeCoverage(candidate)
}

function monthsBetween(from: Period, to: Period): number {
  const [fy, fm] = from.split("-").map(Number) as [number, number]
  const [ty, tm] = to.split("-").map(Number) as [number, number]
  return (ty - fy) * 12 + (tm - fm)
}

export function windowDays(window: ServiceWindow): number {
  return Math.max(0, diffDays(window.start, window.end) + 1)
}

/** When someone lived here. Both ends are inclusive and both are optional. */
export type Residency = Pick<Person, "from" | "to">

/** Days of `window` that fall inside someone's residency. */
export function residentDays(
  window: ServiceWindow,
  residency: Residency
): number {
  const start =
    residency.from && residency.from > window.start ? residency.from : window.start
  const end = residency.to && residency.to < window.end ? residency.to : window.end
  return Math.max(0, diffDays(start, end) + 1)
}

/** 0–1: how much of a bill's service window someone was here for. */
export function residentFraction(
  window: ServiceWindow,
  residency: Residency
): number {
  const total = windowDays(window)
  if (total <= 0) return 1
  if (!residency.from && !residency.to) return 1
  return Math.min(1, residentDays(window, residency) / total)
}

/** True when the window runs from the 1st to the last day of whole months. */
export function isWholeMonths(window: ServiceWindow): boolean {
  return (
    window.start === firstOfPeriod(periodOf(window.start)) &&
    window.end === lastOfPeriod(periodOf(window.end))
  )
}

/** "August 2026", "July – August 2026", or "Jul 3 – Aug 12". */
export function formatWindow(window: ServiceWindow, locale = "en-US"): string {
  const first = periodOf(window.start)
  const last = periodOf(window.end)
  if (isWholeMonths(window)) {
    if (first === last) return formatPeriod(first, locale)
    const head = formatPeriod(first, locale).replace(/\s+\d{4}$/, "")
    return `${head} – ${formatPeriod(last, locale)}`
  }
  return `${formatShortDate(window.start, locale)} – ${formatShortDate(window.end, locale)}`
}

/** How an item's coverage reads in Setup, with no particular month in mind. */
export function describeCoverage(coverage?: Coverage): string {
  const { offsetMonths, spanMonths, startDay } = normalizeCoverage(coverage)
  const ending =
    offsetMonths === 0
      ? "the month it's billed in"
      : offsetMonths === 1
        ? "the month before"
        : `${offsetMonths} months back`
  const months =
    spanMonths === 1
      ? `Covers ${ending}.`
      : `Covers ${spanMonths} months, ending with ${ending}.`
  if (!startDay) return months
  const cycle = `Reads on the ${ordinal(startDay)}, so it runs from the ${ordinal(startDay)} to the day before.`
  return `${months} ${cycle}`
}

/** True when a bill pays for service before the month it's billed in. */
export function isOffset(coverage?: Coverage): boolean {
  return normalizeCoverage(coverage).offsetMonths > 0
}
