import {
  type CalendarEvent,
  type ISODate,
  type StatementKind,
  addDays,
  buildCalendar,
  lastDueOn,
  paymentStatuses,
  pickPlan,
  statementEvents,
} from "@workspace/core"
import type { LinkView, StatementView } from "./service"

/** Settled statements fall out of the feed this long after their last due date. */
const FEED_HISTORY_DAYS = 35
/** Statuses move once a day, so calendars are asked to refresh daily. */
const REFRESH_MINUTES = 24 * 60

export function calendarName(view: LinkView | null): string {
  const label = view?.link.householdLabel.trim()
  return label ? `RoomPay · ${label}` : "RoomPay"
}

export function pageUrl(origin: string, token: string, statement?: StatementView): string {
  if (!statement) return `${origin}/r/${token}`
  const suffix = statement.kind === "catchup" ? "?kind=catchup" : ""
  return `${origin}/r/${token}/${statement.period}${suffix}`
}

function feedPlan(view: LinkView, statement: StatementView) {
  return pickPlan(
    statement.payload,
    statement.chosenPlan,
    view.link.preferredPlan,
    statement.payload.defaultPlan
  )
}

/**
 * The subscribable feed: every recent or upcoming statement — plus any older
 * one that still has something overdue — each rendered with the roommate's
 * pick for that month, else the plan they last picked, else the owner's
 * default. Every title leads with that payment's status on `today` in the
 * roommate's time zone. An unknown link yields an empty calendar rather than
 * an error, so revoking a link quietly clears the subscriber's events.
 */
export function buildFeed(
  view: LinkView | null,
  options: { origin: string; token: string; today: ISODate }
): string {
  if (!view) return buildCalendar({ name: calendarName(null), events: [] })
  const cutoff = addDays(options.today, -FEED_HISTORY_DAYS)

  const events: CalendarEvent[] = []
  for (const statement of view.statements) {
    const plan = feedPlan(view, statement)
    const recent = lastDueOn(statement.payload) >= cutoff
    const stillOwed = paymentStatuses(plan, statement.receivedCents, options.today).some(
      (p) => p.status === "overdue"
    )
    if (!recent && !stillOwed) continue
    events.push(
      ...statementEvents({
        linkId: view.link.id,
        householdLabel: view.link.householdLabel,
        payload: statement.payload,
        plan,
        revision: statement.revision,
        updatedAt: new Date(statement.updatedAt),
        pageUrl: pageUrl(options.origin, options.token, statement),
        status: { receivedCents: statement.receivedCents, today: options.today },
      })
    )
  }
  events.sort((a, b) => a.date.localeCompare(b.date))

  return buildCalendar({ name: calendarName(view), events, refreshMinutes: REFRESH_MINUTES })
}

/**
 * A one-time calendar for a single statement and plan. Imported events are
 * frozen copies, so these carry no status — it would only go stale.
 */
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
    events: statementEvents({
      linkId: view.link.id,
      householdLabel: view.link.householdLabel,
      payload: statement.payload,
      plan: pickPlan(
        statement.payload,
        options.plan,
        statement.chosenPlan,
        view.link.preferredPlan,
        statement.payload.defaultPlan
      ),
      revision: statement.revision,
      updatedAt: new Date(statement.updatedAt),
      pageUrl: pageUrl(options.origin, options.token, statement),
    }),
  })
}
