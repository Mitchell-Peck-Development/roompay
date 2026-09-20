/** A billing month, "YYYY-MM". */
export type Period = string
/** A calendar day with no time or zone, "YYYY-MM-DD". */
export type ISODate = string

const PERIOD_RE = /^(\d{4})-(0[1-9]|1[0-2])$/
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000

const pad = (n: number, width = 2) => String(n).padStart(width, "0")

// All arithmetic goes through UTC so daylight-saving changes never move a day.
function utc(date: ISODate): number {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

function fromUtc(ms: number): ISODate {
  const d = new Date(ms)
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`
}

function splitPeriod(period: Period): [number, number] {
  const [y, m] = period.split("-").map(Number) as [number, number]
  return [y, m]
}

export function isPeriod(value: unknown): value is Period {
  return typeof value === "string" && PERIOD_RE.test(value)
}

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !DATE_RE.test(value)) return false
  return fromUtc(utc(value)) === value
}

export function daysInMonth(period: Period): number {
  const [y, m] = splitPeriod(period)
  return new Date(Date.UTC(y, m, 0)).getUTCDate()
}

/** The given day of the month, clamped into the month (31 → 28 in February). */
export function dateInPeriod(period: Period, day: number): ISODate {
  const clamped = Math.min(Math.max(1, Math.trunc(day)), daysInMonth(period))
  return `${period}-${pad(clamped)}`
}

export function periodOf(date: ISODate): Period {
  return date.slice(0, 7)
}

export function firstOfPeriod(period: Period): ISODate {
  return `${period}-01`
}

export function lastOfPeriod(period: Period): ISODate {
  return `${period}-${pad(daysInMonth(period))}`
}

/** The period `months` away (negative goes back). */
export function shiftPeriod(period: Period, months: number): Period {
  const [y, m] = splitPeriod(period)
  const d = new Date(Date.UTC(y, m - 1 + months, 1))
  return `${pad(d.getUTCFullYear(), 4)}-${pad(d.getUTCMonth() + 1)}`
}

export const nextPeriod = (period: Period): Period => shiftPeriod(period, 1)
export const prevPeriod = (period: Period): Period => shiftPeriod(period, -1)

export function formatPeriod(period: Period, locale = "en-US"): string {
  const [y, m] = splitPeriod(period)
  return new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, 1)))
}

export function formatShortDate(date: ISODate, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(utc(date)))
}

export function formatLongDate(date: ISODate, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(utc(date)))
}

/** The local calendar day of a Date. */
export function toISODate(date: Date): ISODate {
  return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Local midnight of an ISO date. */
export function parseISODate(date: ISODate): Date {
  const [y, m, d] = date.split("-").map(Number) as [number, number, number]
  return new Date(y, m - 1, d)
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now)
}

export function addDays(date: ISODate, days: number): ISODate {
  return fromUtc(utc(date) + Math.round(days) * DAY_MS)
}

/** Whole days from `a` to `b` (positive when `b` is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((utc(b) - utc(a)) / DAY_MS)
}

/**
 * The month someone most likely wants to bill. Statements for next month
 * arrive in the last week of this one, so from the 25th on we look ahead.
 */
export function defaultPeriod(now: Date): Period {
  const current = periodOf(toISODate(now))
  return now.getDate() >= 25 ? nextPeriod(current) : current
}

export function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"]
  const v = n % 100
  return n + (suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]!)
}
