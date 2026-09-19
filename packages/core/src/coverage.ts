import {
  type ISODate,
  type Period,
  dateInPeriod,
  diffDays,
  firstOfPeriod,
  formatPeriod,
  formatShortDate,
  lastOfPeriod,
  periodOf,
  shiftPeriod,
} from "./dates"
import type { Coverage, Person, ServiceWindow } from "./schema"

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
  return {
    offsetMonths: clamp(coverage.offsetMonths, 0, 24),
    spanMonths: clamp(coverage.spanMonths, 1, 12),
  }
}

/** The service window a bill on `period`'s statement pays for. */
export function coverageWindow(
  period: Period,
  coverage?: Coverage
): ServiceWindow {
  const { offsetMonths, spanMonths } = normalizeCoverage(coverage)
  const last = shiftPeriod(period, -offsetMonths)
  const first = shiftPeriod(last, -(spanMonths - 1))
  return { start: firstOfPeriod(first), end: lastOfPeriod(last) }
}

/** When a bill on `period`'s statement falls due, from the item's usual day. */
export function dueDateFor(period: Period, dueDay?: number): ISODate | undefined {
  if (dueDay === undefined || !Number.isFinite(dueDay)) return undefined
  return dateInPeriod(period, dueDay)
}

/** The coverage a concrete window came from, as far as it can be read back. */
export function coverageOf(
  period: Period,
  window: ServiceWindow
): Coverage | null {
  const first = periodOf(window.start)
  const last = periodOf(window.end)
  if (window.start !== firstOfPeriod(first) || window.end !== lastOfPeriod(last)) {
    return null
  }
  const offsetMonths = monthsBetween(last, period)
  const spanMonths = monthsBetween(first, last) + 1
  if (offsetMonths < 0 || spanMonths < 1) return null
  return { offsetMonths, spanMonths }
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
  const { offsetMonths, spanMonths } = normalizeCoverage(coverage)
  const ending =
    offsetMonths === 0
      ? "the month it's billed in"
      : offsetMonths === 1
        ? "the month before"
        : `${offsetMonths} months back`
  return spanMonths === 1
    ? `Covers ${ending}.`
    : `Covers ${spanMonths} months, ending with ${ending}.`
}

/** True when a bill pays for service before the month it's billed in. */
export function isOffset(coverage?: Coverage): boolean {
  return normalizeCoverage(coverage).offsetMonths > 0
}
