import {
  type CalendarEvent,
  type ISODate,
  type StatementKind,
  addDays,
  buildCalendar,
  lastDueOn,
  pickPlan,
  statementEvents,
} from "@workspace/core"
import type { LinkView, StatementView } from "./service"

/** Statements fall out of the feed this long after their last due date. */
const FEED_HISTORY_DAYS = 35
const REFRESH_MINUTES = 60

export function calendarName(view: LinkView | null): string {
  const label = view?.link.householdLabel.trim()
  return label ? `RoomPay · ${label}` : "RoomPay"
}

export function pageUrl(origin: string, token: string, statement?: StatementView): string {
  if (!statement) return `${origin}/r/${token}`
  const suffix = statement.kind === "catchup" ? "?kind=catchup" : ""
  return `${origin}/r/${token}/${statement.period}${suffix}`
}

function eventsFor(
  view: LinkView,
  statement: StatementView,
  planKeys: (string | null | undefined)[],
  options: { origin: string; token: string }
): CalendarEvent[] {
  return statementEvents({
    linkId: view.link.id,
    householdLabel: view.link.householdLabel,
    payload: statement.payload,
    plan: pickPlan(statement.payload, ...planKeys),
    revision: statement.revision,
    updatedAt: new Date(statement.updatedAt),
    pageUrl: pageUrl(options.origin, options.token, statement),
  })
}

/**
 * The subscribable feed: every recent or upcoming statement, each rendered
 * with the roommate's pick for that month, else the plan they last picked,
 * else the owner's default. An unknown link yields an empty calendar rather
 * than an error, so revoking a link quietly clears the subscriber's events.
 */
export function buildFeed(
  view: LinkView | null,
  options: { origin: string; token: string; today: ISODate }
): string {
  if (!view) return buildCalendar({ name: calendarName(null), events: [] })
  const cutoff = addDays(options.today, -FEED_HISTORY_DAYS)
  const events = view.statements
    .filter((s) => lastDueOn(s.payload) >= cutoff)
    .flatMap((s) =>
      eventsFor(view, s, [s.chosenPlan, view.link.preferredPlan, s.payload.defaultPlan], options)
    )
    .sort((a, b) => a.date.localeCompare(b.date))
  return buildCalendar({
    name: calendarName(view),
    events,
    refreshMinutes: REFRESH_MINUTES,
  })
}

/** A one-time calendar for a single statement and plan. */
export function buildOneOff(
  view: LinkView,
  options: {
    origin: string
    token: string
    period: string
    kind: StatementKind
    plan?: string | null
  }
): string | null {
  const statement = view.statements.find(
    (s) => s.period === options.period && s.kind === options.kind
  )
  if (!statement) return null
  return buildCalendar({
    name: calendarName(view),
    events: eventsFor(
      view,
      statement,
      [options.plan, statement.chosenPlan, view.link.preferredPlan, statement.payload.defaultPlan],
      options
    ),
  })
}
