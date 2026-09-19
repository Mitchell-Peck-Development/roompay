import { type ISODate, addDays, formatShortDate } from "./dates"
import { formatMoney } from "./money"
import type { Plan } from "./plans"
import type { SharePayload } from "./share"

export type CalendarEvent = {
  uid: string
  date: ISODate
  summary: string
  description?: string
  url?: string
  /** Bumped whenever the event changes so calendar apps update in place. */
  sequence?: number
  stamp: Date
  /** Adds a 9 am reminder on the day. */
  alarm?: boolean
}

const encoder = new TextEncoder()

/** RFC 5545 §3.3.11 TEXT escaping. */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n")
}

/**
 * RFC 5545 §3.1 line folding: physical lines are at most 75 octets, and a
 * continuation starts with one space. Splits on code points so a multi-byte
 * character is never cut in half.
 */
export function foldLine(line: string): string {
  if (encoder.encode(line).length <= 75) return line
  const out: string[] = []
  let current = ""
  let size = 0
  for (const char of line) {
    const bytes = encoder.encode(char).length
    if (size + bytes > 75) {
      out.push(current)
      current = " "
      size = 1
    }
    current += char
    size += bytes
  }
  out.push(current)
  return out.join("\r\n")
}

const compactDate = (date: ISODate) => date.replace(/-/g, "")

function utcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")
}

function duration(minutes: number): string {
  if (minutes % 60 === 0) return `PT${minutes / 60}H`
  return `PT${minutes}M`
}

/** A complete VCALENDAR of all-day events, CRLF-terminated. */
export function buildCalendar(options: {
  name: string
  events: CalendarEvent[]
  /** How often subscribed clients are asked to refresh. Omit for one-offs. */
  refreshMinutes?: number
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//RoomPay//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.name)}`,
  ]
  if (options.refreshMinutes) {
    const every = duration(options.refreshMinutes)
    lines.push(`REFRESH-INTERVAL;VALUE=DURATION:${every}`, `X-PUBLISHED-TTL:${every}`)
  }

  for (const event of options.events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${utcStamp(event.stamp)}`,
      `LAST-MODIFIED:${utcStamp(event.stamp)}`,
      `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
      `DTEND;VALUE=DATE:${compactDate(addDays(event.date, 1))}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `SEQUENCE:${event.sequence ?? 0}`,
      // Due dates shouldn't block the day out as "busy".
      "TRANSP:TRANSPARENT"
    )
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`)
    if (event.url) lines.push(`URL:${event.url}`)
    if (event.alarm) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(event.summary)}`,
        // All-day events start at midnight, so this fires at 9 am.
        "TRIGGER:PT9H",
        "END:VALARM"
      )
    }
    lines.push("END:VEVENT")
  }

  lines.push("END:VCALENDAR")
  return lines.map(foldLine).join("\r\n") + "\r\n"
}

/** One event per payment of `plan`, with ids that stay put across edits. */
export function statementEvents(args: {
  /** The link's row id — never the secret token. */
  linkId: string
  householdLabel: string
  payload: SharePayload
  plan: Plan
  revision: number
  updatedAt: Date
  pageUrl?: string
}): CalendarEvent[] {
  const { linkId, householdLabel, payload, plan, revision, updatedAt, pageUrl } = args
  const who = householdLabel.trim() || "RoomPay"
  const schedule = plan.payments
    .map(
      (p, i) =>
        `${i + 1}. ${formatShortDate(p.date)} — ${formatMoney(p.amountCents, payload.currency)}`
    )
    .join("\n")

  return plan.payments.map((payment, i) => ({
    uid: `${linkId}-${payload.period}-${payload.kind}-${plan.key}-${i + 1}@roompay`,
    date: payment.date,
    summary: `Pay ${formatMoney(payment.amountCents, payload.currency)} · ${who}`,
    description: [
      `${payload.title} · ${plan.name} · ${payment.label}`,
      "",
      schedule,
      ...(pageUrl ? ["", pageUrl] : []),
    ].join("\n"),
    url: pageUrl,
    sequence: revision,
    stamp: updatedAt,
    alarm: true,
  }))
}
